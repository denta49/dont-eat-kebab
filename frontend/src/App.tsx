import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider } from 'react-native-paper';
import HomeScreen from './screens/HomeScreen';
import LoginScreen from './screens/LoginScreen';
import ProfileScreen from './screens/ProfileScreen';
import { useEffect, useState } from 'react';
import { api } from './services/api';

const Stack = createNativeStackNavigator();

export default function App() {
  // ... rest of your App component code
} 