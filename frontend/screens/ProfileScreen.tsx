import { View, StyleSheet, Image, Platform } from 'react-native';
import { Text, TextInput, Button, HelperText, Avatar } from 'react-native-paper';
import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { api } from '../services/api';
import * as ImagePicker from 'expo-image-picker';

type Profile = {
  username: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);
      setError('');
      
      console.log('Current user ID:', api.currentUserId); // Debug log
      console.log('Current session:', api.currentSession); // Debug log
      
      const profileData = await api.getProfile();
      console.log('Profile data:', profileData); // Debug log
      setProfile(profileData);
    } catch (error: any) {
      console.error('Profile load error:', error); // Debug log
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateProfile(data: Partial<Profile>) {
    try {
      setUpdating(true);
      setError('');
      
      await api.updateProfile(api.currentUserId!, data);
      await loadProfile();
      alert('Profile updated!');
    } catch (error: any) {
      setError(error.message);
    } finally {
      setUpdating(false);
    }
  }

  async function updatePassword() {
    try {
      setUpdating(true);
      setError('');

      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      alert('Password updated successfully!');
      setNewPassword('');
    } catch (error: any) {
      setError(error.message);
    } finally {
      setUpdating(false);
    }
  }

  async function pickImage() {
    try {
      setUpdating(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      console.log('Image picker result:', result);

      if (!result.canceled) {
        const asset = result.assets[0];
        console.log('Selected asset:', asset);

        const formData = new FormData();
        const fileType = asset.type || 'image/jpeg';
        const fileName = asset.uri.split('/').pop() || 'avatar.jpg';

        formData.append('file', {
          uri: asset.uri,
          type: fileType,
          name: fileName,
        } as any);

        console.log('FormData created:', {
          uri: asset.uri,
          type: fileType,
          name: fileName
        });

        await api.uploadAvatar(api.currentUserId!, formData);
        await loadProfile();
      }
    } catch (error: any) {
      console.error('Image picker error:', error);
      setError(error.message);
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.avatarContainer}>
        {profile?.avatar_url ? (
          <Avatar.Image 
            size={100} 
            source={{ uri: profile.avatar_url }} 
          />
        ) : (
          <Avatar.Icon size={100} icon="account" />
        )}
        <Button onPress={pickImage} style={styles.avatarButton}>
          Change Avatar
        </Button>
      </View>

      <TextInput
        label="Username"
        value={profile?.username || ''}
        onChangeText={(text) => setProfile(prev => ({ ...prev!, username: text }))}
        mode="outlined"
        style={styles.input}
      />

      <TextInput
        label="Full Name"
        value={profile?.full_name || ''}
        onChangeText={(text) => setProfile(prev => ({ ...prev!, full_name: text }))}
        mode="outlined"
        style={styles.input}
      />

      <TextInput
        label="Email"
        value={profile?.email || ''}
        disabled
        mode="outlined"
        style={styles.input}
      />

      <TextInput
        label="New Password"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        mode="outlined"
        style={styles.input}
      />

      {error ? (
        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>
      ) : null}

      <Button
        mode="contained"
        style={styles.button}
        onPress={() => profile && updateProfile(profile)}
        loading={updating}
        disabled={updating}
      >
        Update Profile
      </Button>

      {newPassword ? (
        <Button
          mode="contained"
          style={styles.button}
          onPress={updatePassword}
          loading={updating}
          disabled={updating}
        >
          Update Password
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarButton: {
    marginTop: 10,
  },
  input: {
    marginBottom: 10,
  },
  button: {
    marginTop: 10,
  },
}); 