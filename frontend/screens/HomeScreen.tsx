import { View, StyleSheet, FlatList, Dimensions, ScrollView } from 'react-native';
import { Text, Appbar, Avatar, Card, Button, TextInput, IconButton } from 'react-native-paper';
import { LineChart } from 'react-native-chart-kit';
import { useState, useEffect } from 'react';
import { api } from '../services/api';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

type User = {
  id: string;
  username: string;
  avatar_url: string | null;
  weight_logs?: { weight: number; log_date: string }[];
  weight_history?: { weight: number; log_date: string }[];
};

const ComparisonChart = ({ users }: { users: User[] }) => {
  if (!users.length) return null;

  // Get all unique dates from all users' histories
  const allDates = Array.from(new Set(
    users.flatMap(user => 
      user.weight_history?.map(log => log.log_date) || []
    )
  )).sort();

  // Prepare data for the chart
  const datasets = users.map(user => ({
    data: allDates.map(date => {
      const log = user.weight_history?.find(l => l.log_date === date);
      return log ? log.weight : null;
    }).filter(w => w !== null) as number[],
    color: (opacity = 1) => getRandomColor(user.id, opacity),
  }));

  const labels = allDates.map(date => new Date(date).getDate().toString());

  return (
    <View style={styles.comparisonChartContainer}>
      <Text style={styles.comparisonChartTitle}>Weight Comparison</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chartWrapper}>
          <LineChart
            data={{
              labels,
              datasets,
              legend: users.map(user => user.username)
            }}
            width={Math.max(Dimensions.get('window').width, allDates.length * 40)}
            height={180}
            chartConfig={{
              backgroundColor: '#ffffff',
              backgroundGradientFrom: '#ffffff',
              backgroundGradientTo: '#ffffff',
              decimalPlaces: 1,
              color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
              style: {
                borderRadius: 16
              },
              propsForDots: {
                r: "3",
                strokeWidth: "1",
              },
              propsForLabels: {
                fontSize: 9,
              }
            }}
            bezier
            style={{
              marginVertical: 8,
              borderRadius: 16
            }}
            withDots={true}
            withInnerLines={true}
            withOuterLines={true}
            withVerticalLines={true}
            withHorizontalLines={true}
            withShadow={false}
            segments={5}
            formatYLabel={(value) => `${parseFloat(value).toFixed(1)}kg`}
            renderDotContent={({ x, y, index, indexData }) => (
              <Text
                key={index}
                style={{
                  position: 'absolute',
                  top: y - 18,
                  left: x - 15,
                  fontSize: 10,
                }}
              >
                {indexData}
              </Text>
            )}
          />
        </View>
      </ScrollView>
      <View style={styles.legendContainer}>
        {users.map(user => (
          <View key={user.id} style={styles.legendItem}>
            <View 
              style={[
                styles.legendColor, 
                { backgroundColor: getRandomColor(user.id, 1) }
              ]} 
            />
            <Text style={styles.legendText}>{user.username}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const getRandomColor = (seed: string, opacity: number) => {
  const hash = seed.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  const h = hash % 360;
  return `hsla(${h}, 70%, 50%, ${opacity})`;
};

export default function HomeScreen({ navigation }: any) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [weight, setWeight] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [selectedDate]); // Reload users when date changes

  async function loadUsers() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getUsers(selectedDate);
      
      // Load weight history for each user
      const usersWithHistory = await Promise.all(
        data.map(async (user: User) => {
          const history = await api.getWeightLogs(user.id);
          return {
            ...user,
            weight_history: history.sort((a: any, b: any) => 
              new Date(a.log_date).getTime() - new Date(b.log_date).getTime()
            )
          };
        })
      );
      
      setUsers(usersWithHistory);
    } catch (error: any) {
      console.error('Error loading users:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = async () => {
    await api.logout();
  };

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) {
      setSelectedDate(date);
    }
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + days);
    
    // Don't allow future dates
    if (newDate > new Date()) {
      return;
    }
    
    setSelectedDate(newDate);
  };

  const handleWeightSubmit = async () => {
    if (!weight) {
      setError('Please enter your weight');
      return;
    }

    const weightNum = parseFloat(weight);
    if (isNaN(weightNum) || weightNum <= 0 || weightNum >= 1000) {
      setError('Please enter a valid weight between 0 and 1000 kg');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      console.log('Submitting weight:', { weight: weightNum, date: selectedDate });
      await api.logWeight(weightNum, selectedDate);
      setWeight(''); // Clear input
      await loadUsers(); // This will now load users for the selected date
    } catch (error: any) {
      console.error('Weight submission error:', error);
      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderWeightChart = (history?: { weight: number; log_date: string }[]) => {
    if (!history || history.length === 0) return null;

    const labels = history.map(log => new Date(log.log_date).getDate().toString());
    const data = history.map(log => log.weight);

    return (
      <LineChart
        data={{
          labels,
          datasets: [{
            data
          }]
        }}
        width={Dimensions.get('window').width * 0.3} // Adjust for 3 columns
        height={100}
        chartConfig={{
          backgroundColor: '#ffffff',
          backgroundGradientFrom: '#ffffff',
          backgroundGradientTo: '#ffffff',
          decimalPlaces: 1,
          color: (opacity = 1) => `rgba(81, 150, 244, ${opacity})`,
          labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
          style: {
            borderRadius: 16
          },
          propsForDots: {
            r: "3",
            strokeWidth: "1",
            stroke: "#5196f4"
          }
        }}
        bezier
        style={{
          marginVertical: 8,
          borderRadius: 16
        }}
        withDots={true}
        withInnerLines={false}
        withOuterLines={false}
        withVerticalLines={false}
        withHorizontalLines={true}
      />
    );
  };

  const renderUser = ({ item }: { item: User }) => {
    const isCurrentUser = item.id === api.currentUserId;
    
    return (
      <Card 
        style={[
          styles.userCard,
          isCurrentUser && styles.currentUserCard
        ]}
      >
        <Card.Content style={[
          styles.cardContent,
          isCurrentUser && styles.currentUserCardContent
        ]}>
          {item.avatar_url ? (
            <Avatar.Image 
              size={50}
              source={{ uri: item.avatar_url }} 
            />
          ) : (
            <Avatar.Icon size={50} icon="account" />
          )}
          <Text style={[
            styles.username,
            isCurrentUser && styles.currentUserText
          ]}>
            {item.username}
            {isCurrentUser && ' (You)'}
          </Text>
          
          {/* Weight History Chart */}
          {renderWeightChart(item.weight_history)}
          
          {/* Current Day Weight */}
          <View style={[
            styles.currentWeightContainer,
            isCurrentUser && styles.currentUserWeightContainer
          ]}>
            <Text style={[
              styles.dateLabel,
              isCurrentUser && styles.currentUserText
            ]}>
              {selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}:
            </Text>
            {item.weight_logs?.[0] ? (
              <Text style={[
                styles.currentWeight,
                isCurrentUser && styles.currentUserText
              ]}>
                {item.weight_logs[0].weight} kg
              </Text>
            ) : (
              <Text style={styles.noWeight}>No weight logged</Text>
            )}
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Users" />
        <Appbar.Action icon="account" onPress={() => navigation.navigate('Profile')} />
        <Appbar.Action icon="logout" onPress={handleLogout} />
      </Appbar.Header>

      <ScrollView style={styles.container}>
        <View style={styles.inputSection}>
          {/* Date Navigation */}
          <View style={styles.dateNavigation}>
            <IconButton
              icon="chevron-left"
              mode="contained"
              onPress={() => changeDate(-1)}
            />
            <Button 
              mode="outlined" 
              onPress={() => setShowDatePicker(true)}
              style={styles.dateButton}
            >
              {selectedDate.toLocaleDateString()}
            </Button>
            <IconButton
              icon="chevron-right"
              mode="contained"
              onPress={() => changeDate(1)}
              disabled={selectedDate.toDateString() === new Date().toDateString()}
            />
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="default"
              onChange={handleDateChange}
              maximumDate={new Date()}
            />
          )}

          {/* Weight Input */}
          <View style={styles.weightInputContainer}>
            <TextInput
              label="Weight (kg)"
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              style={styles.weightInput}
              disabled={submitting}
            />
            <Button 
              mode="contained" 
              onPress={handleWeightSubmit}
              loading={submitting}
              disabled={submitting}
              style={styles.submitButton}
            >
              Log Weight
            </Button>
          </View>

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.centerContent}>
            <Text>Loading users...</Text>
          </View>
        ) : (
          <>
            <FlatList
              data={users}
              renderItem={renderUser}
              keyExtractor={(item) => item.id}
              numColumns={3}
              contentContainerStyle={styles.list}
              scrollEnabled={false}  // Disable scroll since we're in ScrollView
            />
            <ComparisonChart users={users} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  inputSection: {
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  dateNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  dateButton: {
    flex: 1,
    marginHorizontal: 8,
  },
  weightInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weightInput: {
    flex: 1,
  },
  submitButton: {
    marginLeft: 8,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  list: {
    padding: 4,
  },
  userCard: {
    flex: 1,
    margin: 4,
    maxWidth: '31%',
    minHeight: 240, // Slightly increased for better spacing
  },
  cardContent: {
    alignItems: 'center',
    padding: 4,
    gap: 4, // Add consistent spacing between elements
  },
  username: {
    marginTop: 2,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 12,
  },
  currentWeightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
    padding: 4,
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
    width: '100%',
  },
  dateLabel: {
    fontSize: 11,
    color: '#666',
  },
  currentWeight: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  error: {
    color: 'red',
    marginTop: 8,
  },
  noWeight: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
  },
  currentUserCard: {
    backgroundColor: '#e3f2fd', // Light blue background
    borderColor: '#2196f3',
    borderWidth: 1,
    elevation: 3, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  currentUserCardContent: {
    backgroundColor: 'transparent',
  },
  currentUserWeightContainer: {
    backgroundColor: '#bbdefb', // Slightly darker blue for weight container
  },
  currentUserText: {
    color: '#1976d2', // Darker blue for text
    fontWeight: 'bold',
  },
  comparisonChartContainer: {
    padding: 8,
    backgroundColor: '#fff',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  comparisonChartTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  chartWrapper: {
    alignItems: 'center',
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 4,
    gap: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  legendColor: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  legendText: {
    fontSize: 10,
    color: '#666',
  },
}); 