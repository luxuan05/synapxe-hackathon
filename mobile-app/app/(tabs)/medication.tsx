import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatbotDialog } from '@/components/chatbot-dialog';
import { useAuth } from '@/hooks/use-auth';

type Med = {
  id: number;
  name: string;
  dosage: string;
  time: string;
  taken: boolean;
  skipped: boolean;
};

const initialMeds: Med[] = [
  { id: 1, name: 'Metformin', dosage: '500mg', time: '8:00 AM', taken: false, skipped: false },
  { id: 2, name: 'Lisinopril', dosage: '10mg', time: '8:00 AM', taken: false, skipped: false },
  { id: 3, name: 'Vitamin D', dosage: '1000 IU', time: '12:00 PM', taken: false, skipped: false },
  { id: 4, name: 'Aspirin', dosage: '81mg', time: '8:00 PM', taken: false, skipped: false },
];

const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const streakDays = [true, true, true, true, true, false, false];

export default function MedicationScreen() {
  const insets = useSafeAreaInsets();
  const [meds, setMeds] = useState(initialMeds);
  const [chatOpen, setChatOpen] = useState(false);
  const { user } = useAuth();

  const takenCount = useMemo(() => meds.filter((m) => m.taken).length, [meds]);
  const points = takenCount * 25;
  const totalPoints = 75 + points;

  const markTaken = (id: number) =>
    setMeds((prev) => prev.map((m) => (m.id === id ? { ...m, taken: true, skipped: false } : m)));

  const markSkipped = (id: number) =>
    setMeds((prev) => prev.map((m) => (m.id === id ? { ...m, skipped: true, taken: false } : m)));

  return (
    <>
      <View style={styles.screen}>
        <View style={[styles.topHeader, { paddingTop: insets.top + 10 }]}>
          <Text style={styles.topTitle}>Medications</Text>
          <Pressable style={styles.chatButton} onPress={() => setChatOpen(true)}>
            <MaterialIcons name="chat-bubble-outline" size={16} color="#efe6ff" />
            <Text style={styles.chatButtonText}>Chat</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + 92, paddingBottom: 120 },
          ]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Medication Tracker</Text>
            <Text style={styles.heroSubtitle}>Stay on top of your health</Text>
          </View>

          {meds.map((med) => (
            <View key={med.id} style={styles.medCard}>
              <View style={styles.medInfo}>
                <Text style={styles.medName}>{med.name}</Text>
                <Text style={styles.medMeta}>
                  {med.dosage} · {med.time}
                </Text>
              </View>

              <View style={styles.actionRow}>
                <Pressable style={[styles.actionBtn, styles.takeBtn]} onPress={() => markTaken(med.id)}>
                  <MaterialIcons name="check" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>{med.taken ? 'Taken' : 'Take'}</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.skipBtn]} onPress={() => markSkipped(med.id)}>
                  <MaterialIcons name="skip-next" size={16} color="#6d6879" />
                  <Text style={styles.skipBtnText}>{med.skipped ? 'Skipped' : 'Skip'}</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <View style={styles.progressCard}>
            <View style={styles.progressHeading}>
              <MaterialIcons name="emoji-events" size={20} color="#7a35d5" />
              <Text style={styles.progressTitle}>Your Progress</Text>
            </View>

            <View style={styles.pointsCard}>
              <Text style={styles.pointsLabel}>Points today</Text>
              <Text style={styles.pointsValue}>{points} pts</Text>
            </View>

            <View style={styles.streakRow}>
              <MaterialIcons name="local-fire-department" size={18} color="#7a35d5" />
              <Text style={styles.streakText}>5-day streak!</Text>
            </View>

            <View style={styles.weekRow}>
              {weekDays.map((day, index) => (
                <View key={`${day}-${index}`} style={styles.weekItem}>
                  <View style={[styles.dayDot, streakDays[index] && styles.dayDotActive]}>
                    {streakDays[index] ? (
                      <MaterialIcons name="check" size={16} color="#fff" />
                    ) : (
                      <Text style={styles.dayDotText}>S</Text>
                    )}
                  </View>
                  <Text style={styles.dayText}>{day}</Text>
                </View>
              ))}
            </View>

            <View style={styles.rewardCard}>
              <View style={styles.rewardHeading}>
                <MaterialIcons name="card-giftcard" size={18} color="#7a35d5" />
                <Text style={styles.rewardTitle}>Health Voucher Reward</Text>
              </View>
              <View style={styles.rewardBarTrack}>
                <View style={[styles.rewardBarFill, { width: `${Math.min(totalPoints, 100)}%` }]} />
              </View>
              <Text style={styles.rewardText}>{totalPoints}/100 points - Earn 100 for a health voucher!</Text>
            </View>
          </View>
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
  medCard: {
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#29173e',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  medInfo: {
    flex: 1,
    marginRight: 10,
  },
  medName: {
    color: '#1f1a29',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 2,
  },
  medMeta: {
    color: '#666073',
    fontSize: 14,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  actionBtn: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  takeBtn: {
    backgroundColor: '#28c76f',
  },
  skipBtn: {
    backgroundColor: '#efedf4',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  skipBtnText: {
    color: '#6d6879',
    fontWeight: '600',
    fontSize: 16,
  },
  progressCard: {
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
  progressHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTitle: {
    color: '#1f1a29',
    fontSize: 17,
    fontWeight: '700',
  },
  pointsCard: {
    backgroundColor: '#ece5f7',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pointsLabel: {
    color: '#6f31c3',
    fontSize: 15,
  },
  pointsValue: {
    color: '#6f31c3',
    fontSize: 21,
    fontWeight: '700',
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  streakText: {
    color: '#1f1a29',
    fontSize: 16,
    fontWeight: '600',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekItem: {
    alignItems: 'center',
    gap: 4,
  },
  dayDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efedf4',
  },
  dayDotActive: {
    backgroundColor: '#7a35d5',
  },
  dayDotText: {
    color: '#666073',
    fontWeight: '700',
  },
  dayText: {
    color: '#666073',
    fontSize: 11,
  },
  rewardCard: {
    borderRadius: 14,
    backgroundColor: '#ece5f7',
    padding: 12,
    gap: 8,
  },
  rewardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rewardTitle: {
    color: '#6f31c3',
    fontSize: 16,
    fontWeight: '600',
  },
  rewardBarTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: '#d8c9ef',
    overflow: 'hidden',
  },
  rewardBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#7a35d5',
  },
  rewardText: {
    color: '#666073',
    fontSize: 14,
  },
});
