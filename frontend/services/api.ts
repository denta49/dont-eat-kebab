import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';

type Session = {
  access_token: string;
  refresh_token: string;
  user_id: string;
};

// Store the session in memory
let currentSession: Session | null = null;
let sessionListeners: ((session: Session | null) => void)[] = [];

export const api = {
  get currentSession() {
    return currentSession;
  },

  get currentUserId() {
    return currentSession?.user_id;
  },

  async setSession(session: Session) {
    console.log('Setting session:', session);
    currentSession = session;
    // Store session in AsyncStorage
    await AsyncStorage.setItem('session', JSON.stringify(session));
    sessionListeners.forEach(listener => listener(session));
  },

  async clearSession() {
    currentSession = null;
    // Remove session from AsyncStorage
    await AsyncStorage.removeItem('session');
    sessionListeners.forEach(listener => listener(null));
  },

  async loadStoredSession() {
    try {
      const storedSession = await AsyncStorage.getItem('session');
      if (storedSession) {
        const session = JSON.parse(storedSession);
        this.setSession(session);
        return session;
      }
    } catch (error) {
      console.error('Error loading stored session:', error);
    }
    return null;
  },

  onSessionChange(listener: (session: Session | null) => void) {
    sessionListeners.push(listener);
    return () => {
      sessionListeners = sessionListeners.filter(l => l !== listener);
    };
  },

  getAuthHeader() {
    console.log('Getting auth header from session:', currentSession); // Debug log
    return currentSession ? { 'Authorization': `Bearer ${currentSession.access_token}` } : {};
  },

  async login(email: string, password: string) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(error.detail || 'Login failed');
    }
    
    const data = await response.json();
    console.log('Login response:', data); // Debug log
    
    this.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user_id: data.user.id
    });
    
    return data;
  },

  async register(email: string, password: string) {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(error.detail || 'Registration failed');
    }
    
    return response.json();
  },

  async getProfile(userId?: string) {
    const id = userId || this.currentUserId;
    if (!id) {
      throw new Error('No user ID available');
    }

    const headers = this.getAuthHeader();
    console.log('Request headers:', headers); // Debug log

    const response = await fetch(`${API_URL}/profile/${id}`, {
      headers: {
        ...headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      console.log('Profile fetch error:', errorData); // Debug log
      throw new Error(errorData.detail || 'Failed to fetch profile');
    }
    return response.json();
  },

  async updateProfile(userId: string, data: { username?: string; full_name?: string }) {
    const response = await fetch(`${API_URL}/profile/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('Failed to update profile');
    }
    return response.json();
  },

  async uploadAvatar(userId: string, formData: FormData) {
    console.log('Uploading avatar for user:', userId); // Debug log
    console.log('FormData:', formData); // Debug log
    
    const response = await fetch(`${API_URL}/profile/${userId}/avatar`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeader(),
        // Don't set Content-Type here, let the browser set it with the boundary
      },
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to upload avatar' }));
      console.error('Avatar upload error:', error); // Debug log
      throw new Error(error.detail || 'Failed to upload avatar');
    }
    
    return response.json();
  },

  async logout() {
    this.clearSession();
  },

  async getUsers(date?: Date) {
    let url = `${API_URL}/users`;
    if (date) {
      url += `?date=${date.toISOString().split('T')[0]}`;
    }
    
    const response = await fetch(url, {
      headers: {
        ...this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      console.log('Users fetch error:', errorData);
      throw new Error(errorData.detail || 'Failed to fetch users');
    }
    return response.json();
  },

  async logWeight(weight: number, date?: Date) {
    const response = await fetch(`${API_URL}/weight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader(),
      },
      body: JSON.stringify({
        weight: weight,
        log_date: date?.toISOString().split('T')[0] || null,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to log weight' }));
      throw new Error(error.detail || 'Failed to log weight');
    }
    return response.json();
  },

  async getWeightLogs(userId: string, startDate?: Date, endDate?: Date) {
    let url = `${API_URL}/weight/${userId}`;
    const params = new URLSearchParams();
    
    if (startDate) params.append('start_date', startDate.toISOString().split('T')[0]);
    if (endDate) params.append('end_date', endDate.toISOString().split('T')[0]);
    
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        ...this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch weight logs' }));
      throw new Error(error.detail || 'Failed to fetch weight logs');
    }
    return response.json();
  }
}; 