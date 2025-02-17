import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ProfileScreen from './screens/ProfileScreen';
import HomeScreen from './screens/HomeScreen';
import { useState, useEffect } from 'react';
import { api } from './services/api';

const Stack = createNativeStackNavigator();

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load stored session on app start
    async function loadSession() {
      try {
        await api.loadStoredSession();
      } finally {
        setLoading(false);
      }
    }
    loadSession();

    // Listen for session changes
    const unsubscribe = api.onSessionChange((newSession) => {
      setSession(newSession);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return null; // Or a loading screen
  }

  return (
    <PaperProvider>
      <NavigationContainer>
        <Stack.Navigator>
          {!session ? (
            // Auth stack
            <>
              <Stack.Screen 
                name="Login" 
                component={LoginScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen 
                name="Register" 
                component={RegisterScreen}
                options={{ headerShown: false }}
              />
            </>
          ) : (
            // Main app stack
            <>
              <Stack.Screen 
                name="Home" 
                component={HomeScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen 
                name="Profile" 
                component={ProfileScreen}
                options={({ route }: any) => ({
                  title: route.params?.userId ? 'User Profile' : 'My Profile'
                })}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
