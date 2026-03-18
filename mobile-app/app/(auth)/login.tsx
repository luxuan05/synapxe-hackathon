import { Link, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { useAuth } from '@/hooks/use-auth';
import BrandLogo from '@/components/brand-logo';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithSingpass } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const trimmedEmail = username.trim();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await loginWithSingpass(trimmedEmail, password);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#ffffff', '#f8f5ff', '#f3edff']} style={StyleSheet.absoluteFill} />
      <View style={styles.blobTopLeft} />
      <View style={styles.blobRight} />
      <View style={styles.blobBottom} />

      <View style={styles.card}>
        <View style={styles.brandWrap}>
          <BrandLogo size="lg" />
        </View>

        <View style={styles.headingRow}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="verified-user" size={20} color="#7a35d5" />
          </View>
          <View style={styles.headingTextWrap}>
            <Text style={styles.title}>Patient Login</Text>
            <Text style={styles.subtitle}>(Singpass-mimic)</Text>
          </View>
        </View>

        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Username (email)"
          placeholderTextColor="#8d87a1"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor="#8d87a1"
          style={styles.input}
        />

        <Pressable style={[styles.primaryButton, loading && styles.disabled]} disabled={loading} onPress={handleLogin}>
          <Text style={styles.primaryButtonText}>{loading ? 'Signing in...' : 'Login with Singpass'}</Text>
        </Pressable>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Text style={styles.helperText}>
          New account?{' '}
          <Link href="/(auth)/register" style={styles.linkText}>
            Register with Singpass
          </Link>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: '#fff',
  },
  blobTopLeft: {
    position: 'absolute',
    top: -80,
    left: -70,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(168,85,247,0.22)',
  },
  blobRight: {
    position: 'absolute',
    right: -90,
    top: '36%',
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(139,92,246,0.18)',
  },
  blobBottom: {
    position: 'absolute',
    left: '25%',
    bottom: -110,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(217,70,239,0.16)',
  },
  card: {
    borderRadius: 22,
    padding: 24,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: '#ece2ff',
    shadowColor: '#4b2a77',
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    gap: 12,
  },
  brandWrap: {
    marginBottom: 6,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1e8ff',
  },
  headingTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f1a2b',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
    color: '#6c6680',
  },
  input: {
    borderWidth: 1,
    borderColor: '#dfd8ee',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f1a2b',
  },
  primaryButton: {
    marginTop: 6,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
    backgroundColor: '#7a35d5',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
  errorText: {
    marginTop: 2,
    color: '#cc335f',
    fontSize: 14,
  },
  helperText: {
    marginTop: 4,
    color: '#5f5874',
    fontSize: 14,
  },
  linkText: {
    color: '#7a35d5',
    fontWeight: '700',
  },
});
