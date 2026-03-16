import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatbotDialog } from '@/components/chatbot-dialog';
import { useAuth } from '@/hooks/use-auth';

type Summary = {
  id: number;
  date: string; // ISO timestamp from backend
  doctorName: string;
  clinic: string;
  summaryText: string;
};

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000');

export default function VisitsScreen() {
  const insets = useSafeAreaInsets();
  const [chatOpen, setChatOpen] = useState(false);
  const { user, token } = useAuth();
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/patient/summaries`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail ?? 'Failed to load visit summaries');
        }
        const data = (await res.json()) as Array<{
          id: number;
          date: string;
          doctor_name: string;
          clinic: string;
          summary_text: string;
        }>;
        setSummaries(
          data.map((item) => ({
            id: item.id,
            date: item.date,
            doctorName: `Dr. ${item.doctor_name}`,
            clinic: item.clinic,
            summaryText: item.summary_text
          }))
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load visit summaries');
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [token]);

  return (
    <>
      <View style={styles.screen}>
        <View style={[styles.topHeader, { paddingTop: insets.top + 10 }]}>
          <Text style={styles.topTitle}>Summaries</Text>
          <Pressable style={styles.chatButton} onPress={() => setChatOpen(true)}>
            <MaterialIcons name="chat-bubble-outline" size={16} color="#efe6ff" />
            <Text style={styles.chatButtonText}>Chat</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.container, { paddingTop: insets.top + 92, paddingBottom: 120 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Visit Summaries</Text>
            <Text style={styles.heroSubtitle}>Your simplified appointment notes</Text>
          </View>

          {loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="small" color="#7a35d5" />
              <Text style={styles.stateText}>Loading summaries...</Text>
            </View>
          ) : error ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateErrorText}>{error}</Text>
            </View>
          ) : summaries.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateText}>No doctor summaries available yet.</Text>
            </View>
          ) : summaries.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.doctorRow}>
                  <View style={styles.doctorIconWrap}>
                    <MaterialIcons name="medical-services" size={20} color="#7a35d5" />
                  </View>
                  <View style={styles.doctorTextWrap}>
                    <Text style={styles.doctorName}>{item.doctorName}</Text>
                    <Text style={styles.clinicText}>{item.clinic}</Text>
                    <View style={styles.dateRow}>
                      <MaterialIcons name="calendar-month" size={14} color="#706b7b" />
                      <Text style={styles.dateText}>{new Date(item.date).toLocaleDateString('en-SG')}</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.summaryText}>{item.summaryText}</Text>
              </View>
            ))}
        </ScrollView>
      </View>

      <ChatbotDialog open={chatOpen} onClose={() => setChatOpen(false)} patientId={user?.id ? String(user.id) : undefined} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f2f8',
  },
  topHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
    backgroundColor: '#7a35d5',
    shadowColor: '#2d1b4b',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  topTitle: {
    color: '#f3ebff',
    fontSize: 34,
    fontWeight: '700',
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  chatButtonText: {
    color: '#f3ebff',
    fontSize: 16,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 16,
    gap: 12,
  },
  heroCard: {
    marginHorizontal: -16,
    marginTop: -28,
    marginBottom: 8,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 20,
    backgroundColor: '#ece5f7',
  },
  heroTitle: {
    color: '#171126',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
  heroSubtitle: {
    color: '#6f687c',
    fontSize: 17,
    marginTop: 4,
  },
  card: {
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 16,
    gap: 12,
    shadowColor: '#29173e',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  doctorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  doctorIconWrap: {
    height: 42,
    width: 42,
    borderRadius: 12,
    backgroundColor: '#f1ebfb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doctorTextWrap: {
    flex: 1,
  },
  doctorName: {
    color: '#1f1a29',
    fontSize: 20,
    fontWeight: '700',
  },
  clinicText: {
    color: '#666073',
    fontSize: 14,
    marginTop: 1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  dateText: {
    color: '#706b7b',
    fontSize: 14,
  },
  summaryText: {
    color: '#35303f',
    fontSize: 17,
    lineHeight: 30,
  },
  stateCard: {
    borderRadius: 18,
    backgroundColor: '#fff',
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#29173e',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  stateText: {
    color: '#666073',
    fontSize: 15,
  },
  stateErrorText: {
    color: '#c12f57',
    fontSize: 14,
    textAlign: 'center',
  },
});
