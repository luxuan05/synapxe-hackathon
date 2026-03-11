import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatbotDialog } from '@/components/chatbot-dialog';
import { useAuth } from '@/hooks/use-auth';

type Summary = {
  id: number;
  date: string;
  doctor: string;
  clinic: string;
  summary: string;
  takeaways: string[];
  followUp: string;
};

const summaries: Summary[] = [
  {
    id: 1,
    date: 'Feb 20, 2026',
    doctor: 'Dr. Emily Chen',
    clinic: 'City Health Clinic',
    summary: 'Discussed blood sugar levels and adjusted medication dosage. Overall health is improving with current treatment plan.',
    takeaways: [
      'Blood sugar levels improved over the past month',
      'Continue current diet and exercise routine',
      'Metformin adjusted from 250mg to 500mg',
    ],
    followUp: 'Schedule follow-up in 4 weeks.',
  },
  {
    id: 2,
    date: 'Jan 15, 2026',
    doctor: 'Dr. James Park',
    clinic: 'Heart & Wellness Center',
    summary: 'Annual heart checkup completed. EKG results are normal.',
    takeaways: ['Heart health is in good condition', 'Blood pressure remains in normal range'],
    followUp: 'Next annual checkup in 12 months.',
  },
  {
    id: 3,
    date: 'Dec 5, 2025',
    doctor: 'Dr. Maria Santos',
    clinic: 'City Health Clinic',
    summary: 'Vitamin D deficiency detected. Prescribed supplementation and recommended more time outdoors.',
    takeaways: ['Start Vitamin D 1000 IU daily', 'Try to get 15 minutes of sunlight daily'],
    followUp: 'Recheck Vitamin D levels in 3 months.',
  },
];

export default function VisitsScreen() {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const { user } = useAuth();

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

          {summaries.map((item) => {
            const open = expanded === item.id;
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.doctorRow}>
                  <View style={styles.doctorIconWrap}>
                    <MaterialIcons name="medical-services" size={20} color="#7a35d5" />
                  </View>
                  <View style={styles.doctorTextWrap}>
                    <Text style={styles.doctorName}>{item.doctor}</Text>
                    <Text style={styles.clinicText}>{item.clinic}</Text>
                    <View style={styles.dateRow}>
                      <MaterialIcons name="calendar-month" size={14} color="#706b7b" />
                      <Text style={styles.dateText}>{item.date}</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.summaryText}>{item.summary}</Text>

                {open ? (
                  <View style={styles.details}>
                    <Text style={styles.detailsHeading}>Key Takeaways</Text>
                    {item.takeaways.map((takeaway) => (
                      <Text key={takeaway} style={styles.detailsItem}>
                        - {takeaway}
                      </Text>
                    ))}
                    <Text style={styles.detailsHeading}>Follow-up</Text>
                    <Text style={styles.detailsItem}>{item.followUp}</Text>
                  </View>
                ) : null}

                <Pressable style={styles.toggleBtn} onPress={() => setExpanded(open ? null : item.id)}>
                  <Text style={styles.toggleText}>{open ? 'Hide Summary' : 'View Full Summary'}</Text>
                  <MaterialIcons
                    name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                    size={18}
                    color="#6f31c3"
                  />
                </Pressable>
              </View>
            );
          })}
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
  details: {
    gap: 4,
  },
  detailsHeading: {
    color: '#6f31c3',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  detailsItem: {
    color: '#474150',
    fontSize: 14,
    lineHeight: 20,
  },
  toggleBtn: {
    borderRadius: 14,
    backgroundColor: '#ece5f7',
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  toggleText: {
    color: '#6f31c3',
    fontSize: 16,
    fontWeight: '700',
  },
});
