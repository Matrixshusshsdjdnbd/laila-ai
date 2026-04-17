import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  SafeAreaView, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  bg: '#0A0908', card: '#141311', primary: '#FFC107', primaryDark: '#422006',
  secondary: '#211F1C', secondaryFg: '#FDE68A', muted: '#27272A', mutedFg: '#A1A1AA',
  white: '#FFFFFF', text: '#E4E4E7', success: '#22C55E', wave: '#1DC3DC', orange: '#FF6600',
};

type Plan = { id: string; name: string; price: number; currency: string; duration_days: number; description: string; popular?: boolean; savings?: string; };

export default function PremiumScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentResult, setPaymentResult] = useState<'success' | 'failed' | null>(null);
  const [userTier, setUserTier] = useState('free');
  const [step, setStep] = useState<'plans' | 'payment' | 'result'>('plans');

  useEffect(() => { loadData(); }, []);

  const getAuthHeaders = async () => {
    const token = await AsyncStorage.getItem('laila_auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadData = async () => {
    try {
      const headers = await getAuthHeaders();
      const [plansRes, meRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/payment/plans`),
        fetch(`${BACKEND_URL}/api/auth/me`, { headers }),
      ]);
      if (plansRes.ok) { const d = await plansRes.json(); setPlans(d.plans); }
      if (meRes.ok) { const d = await meRes.json(); setUserTier(d.tier); }
    } catch {}
  };

  const initiatePayment = async () => {
    if (!selectedPlan || !paymentMethod) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${BACKEND_URL}/api/payment/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ plan_id: selectedPlan, payment_method: paymentMethod, phone_number: phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setPaymentResult(data.status === 'completed' ? 'success' : 'failed');
      setStep('result');
      if (data.status === 'completed') { setUserTier('premium'); }
    } catch (err: any) {
      setPaymentResult('failed');
      setStep('result');
    } finally {
      setLoading(false);
    }
  };

  const resetFlow = () => { setStep('plans'); setSelectedPlan(null); setPaymentMethod(null); setPaymentResult(null); setPhoneNumber(''); };

  const selectedPlanData = plans.find(p => p.id === selectedPlan);

  // ─── Result Screen ────────────────────
  if (step === 'result') {
    const isSuccess = paymentResult === 'success';
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.resultContent}>
          <View style={[styles.resultIcon, { backgroundColor: isSuccess ? COLORS.success + '20' : '#EF444420' }]}>
            <Ionicons name={isSuccess ? 'checkmark-circle' : 'close-circle'} size={64} color={isSuccess ? COLORS.success : '#EF4444'} />
          </View>
          <Text style={styles.resultTitle}>{isSuccess ? 'Payment Successful!' : 'Payment Failed'}</Text>
          <Text style={styles.resultDesc}>
            {isSuccess
              ? 'Welcome to LAILA AI Premium! You now have unlimited access to all features.'
              : 'Something went wrong with your payment. Please try again.'}
          </Text>
          {isSuccess && (
            <View style={styles.premiumBadge}>
              <Ionicons name="star" size={20} color={COLORS.primary} />
              <Text style={styles.premiumBadgeText}>PREMIUM ACTIVE</Text>
            </View>
          )}
          <TouchableOpacity testID="result-done-btn" style={styles.doneBtn} onPress={resetFlow}>
            <Text style={styles.doneBtnText}>{isSuccess ? 'Start Using Premium' : 'Try Again'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Payment Method Screen ────────────
  if (step === 'payment' && selectedPlanData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity testID="back-to-plans" onPress={() => setStep('plans')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payment</Text>
        </View>
        <ScrollView contentContainerStyle={styles.payContent}>
          {/* Selected Plan Summary */}
          <View style={styles.planSummary}>
            <Text style={styles.summaryLabel}>Selected Plan</Text>
            <Text style={styles.summaryPlan}>{selectedPlanData.name} — {selectedPlanData.price} {selectedPlanData.currency}</Text>
            <Text style={styles.summaryDuration}>{selectedPlanData.description}</Text>
          </View>

          {/* Payment Methods */}
          <Text style={styles.sectionTitle}>Choose Payment Method</Text>

          <TouchableOpacity
            testID="pay-wave"
            style={[styles.methodCard, paymentMethod === 'wave' && styles.methodCardActive]}
            onPress={() => setPaymentMethod('wave')}
          >
            <View style={[styles.methodIcon, { backgroundColor: COLORS.wave + '20' }]}>
              <Ionicons name="wallet" size={24} color={COLORS.wave} />
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodName}>Wave</Text>
              <Text style={styles.methodDesc}>Pay with Wave mobile money</Text>
            </View>
            <View style={[styles.radio, paymentMethod === 'wave' && styles.radioActive]}>
              {paymentMethod === 'wave' && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            testID="pay-orange"
            style={[styles.methodCard, paymentMethod === 'orange_money' && styles.methodCardActive]}
            onPress={() => setPaymentMethod('orange_money')}
          >
            <View style={[styles.methodIcon, { backgroundColor: COLORS.orange + '20' }]}>
              <Ionicons name="phone-portrait" size={24} color={COLORS.orange} />
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodName}>Orange Money</Text>
              <Text style={styles.methodDesc}>Pay with Orange Money</Text>
            </View>
            <View style={[styles.radio, paymentMethod === 'orange_money' && styles.radioActive]}>
              {paymentMethod === 'orange_money' && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>

          {/* Phone Number */}
          {paymentMethod && (
            <View style={styles.phoneWrap}>
              <Text style={styles.phoneLabel}>Phone Number (optional)</Text>
              <TextInput
                testID="phone-input"
                style={styles.phoneInput}
                placeholder="+221 77 000 00 00"
                placeholderTextColor={COLORS.mutedFg}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
              />
            </View>
          )}

          {/* Pay Button */}
          <TouchableOpacity
            testID="confirm-payment-btn"
            style={[styles.payBtn, (!paymentMethod || loading) && styles.payBtnDisabled]}
            onPress={initiatePayment}
            disabled={!paymentMethod || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.primaryDark} />
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={20} color={COLORS.primaryDark} />
                <Text style={styles.payBtnText}>Pay {selectedPlanData.price} {selectedPlanData.currency}</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.secureText}>
            Secure payment · Cancel anytime · Instant activation
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Plans Screen ─────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.plansContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.premiumHeader}>
          <View style={styles.crownCircle}>
            <Ionicons name="star" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.premiumTitle}>LAILA AI Premium</Text>
          <Text style={styles.premiumDesc}>Unlock unlimited AI power for your daily life</Text>
        </View>

        {/* Current Tier */}
        {userTier === 'premium' ? (
          <View style={styles.activeBadge}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            <Text style={styles.activeBadgeText}>Premium Active</Text>
          </View>
        ) : (
          <View style={styles.freeBadge}>
            <Text style={styles.freeBadgeText}>Free Plan — 20 messages/day</Text>
          </View>
        )}

        {/* Premium Features */}
        <Text style={styles.featuresTitle}>Premium includes:</Text>
        {[
          { icon: 'infinite', text: 'Unlimited messages' },
          { icon: 'mic', text: 'Voice input & output' },
          { icon: 'camera', text: 'Image & photo analysis' },
          { icon: 'briefcase', text: 'Advanced Work & Business AI' },
          { icon: 'school', text: 'Full Study & Tutoring' },
          { icon: 'flash', text: 'Faster responses' },
        ].map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <Ionicons name={f.icon as any} size={20} color={COLORS.primary} />
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}

        {/* Plans */}
        <Text style={styles.plansTitle}>Choose your plan</Text>
        {plans.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            testID={`plan-${plan.id}`}
            style={[styles.planCard, selectedPlan === plan.id && styles.planCardActive, plan.popular && styles.planCardPopular]}
            onPress={() => setSelectedPlan(plan.id)}
          >
            {plan.popular && (
              <View style={styles.popularTag}><Text style={styles.popularTagText}>MOST POPULAR</Text></View>
            )}
            <View style={styles.planRow}>
              <View style={[styles.planRadio, selectedPlan === plan.id && styles.planRadioActive]}>
                {selectedPlan === plan.id && <View style={styles.planRadioDot} />}
              </View>
              <View style={styles.planDetails}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planDuration}>{plan.description}</Text>
              </View>
              <View style={styles.planPriceWrap}>
                <Text style={styles.planPrice}>{plan.price}</Text>
                <Text style={styles.planCurrency}>{plan.currency}</Text>
              </View>
            </View>
            {plan.savings && <Text style={styles.savingsText}>{plan.savings}</Text>}
          </TouchableOpacity>
        ))}

        {/* Continue Button */}
        {userTier !== 'premium' && (
          <TouchableOpacity
            testID="continue-to-payment-btn"
            style={[styles.continueBtn, !selectedPlan && styles.continueBtnDisabled]}
            onPress={() => { if (selectedPlan) setStep('payment'); }}
            disabled={!selectedPlan}
          >
            <Text style={styles.continueBtnText}>Continue to Payment</Text>
            <Ionicons name="arrow-forward" size={20} color={COLORS.primaryDark} />
          </TouchableOpacity>
        )}

        {/* Payment Methods Logos */}
        <View style={styles.methodsRow}>
          <View style={[styles.methodBadge, { backgroundColor: COLORS.wave + '20' }]}>
            <Ionicons name="wallet" size={16} color={COLORS.wave} />
            <Text style={[styles.methodBadgeText, { color: COLORS.wave }]}>Wave</Text>
          </View>
          <View style={[styles.methodBadge, { backgroundColor: COLORS.orange + '20' }]}>
            <Ionicons name="phone-portrait" size={16} color={COLORS.orange} />
            <Text style={[styles.methodBadgeText, { color: COLORS.orange }]}>Orange Money</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  // Plans screen
  plansContent: { padding: 20, paddingTop: Platform.OS === 'android' ? 44 : 12, paddingBottom: 40 },
  premiumHeader: { alignItems: 'center', marginBottom: 20 },
  crownCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primary + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  premiumTitle: { fontSize: 26, fontWeight: '800', color: COLORS.white, marginBottom: 4 },
  premiumDesc: { fontSize: 14, color: COLORS.mutedFg, textAlign: 'center' },
  activeBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.success + '15', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, marginBottom: 20 },
  activeBadgeText: { fontSize: 15, fontWeight: '700', color: COLORS.success },
  freeBadge: { alignItems: 'center', backgroundColor: COLORS.card, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, marginBottom: 20, borderWidth: 0.5, borderColor: COLORS.muted },
  freeBadgeText: { fontSize: 14, color: COLORS.mutedFg },
  featuresTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white, marginBottom: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10, paddingLeft: 4 },
  featureText: { fontSize: 14, color: COLORS.text },
  plansTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white, marginTop: 20, marginBottom: 12 },
  planCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.muted },
  planCardActive: { borderColor: COLORS.primary },
  planCardPopular: { borderColor: COLORS.primary + '60' },
  popularTag: { position: 'absolute', top: -10, right: 16, backgroundColor: COLORS.primary, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  popularTagText: { fontSize: 10, fontWeight: '800', color: COLORS.primaryDark, letterSpacing: 0.5 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.muted, alignItems: 'center', justifyContent: 'center' },
  planRadioActive: { borderColor: COLORS.primary },
  planRadioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.primary },
  planDetails: { flex: 1 },
  planName: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  planDuration: { fontSize: 12, color: COLORS.mutedFg, marginTop: 2 },
  planPriceWrap: { alignItems: 'flex-end' },
  planPrice: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  planCurrency: { fontSize: 11, color: COLORS.mutedFg, fontWeight: '600' },
  savingsText: { fontSize: 12, color: COLORS.success, fontWeight: '600', marginTop: 6, marginLeft: 34 },
  continueBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, marginTop: 16 },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { fontSize: 17, fontWeight: '700', color: COLORS.primaryDark },
  methodsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 20 },
  methodBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  methodBadgeText: { fontSize: 13, fontWeight: '600' },
  // Payment screen
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 44 : 12, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.muted },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.white },
  payContent: { padding: 20, paddingBottom: 40 },
  planSummary: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 0.5, borderColor: COLORS.primary + '30' },
  summaryLabel: { fontSize: 12, color: COLORS.mutedFg, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryPlan: { fontSize: 18, fontWeight: '700', color: COLORS.white },
  summaryDuration: { fontSize: 13, color: COLORS.mutedFg, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white, marginBottom: 12 },
  methodCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.muted },
  methodCardActive: { borderColor: COLORS.primary },
  methodIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  methodInfo: { flex: 1 },
  methodName: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  methodDesc: { fontSize: 12, color: COLORS.mutedFg, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.muted, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: COLORS.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.primary },
  phoneWrap: { marginTop: 16, marginBottom: 8 },
  phoneLabel: { fontSize: 13, color: COLORS.mutedFg, marginBottom: 8, fontWeight: '500' },
  phoneInput: { backgroundColor: COLORS.card, borderRadius: 14, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 16 : 12, fontSize: 16, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.muted },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, marginTop: 20 },
  payBtnDisabled: { opacity: 0.4 },
  payBtnText: { fontSize: 17, fontWeight: '700', color: COLORS.primaryDark },
  secureText: { fontSize: 12, color: COLORS.mutedFg, textAlign: 'center', marginTop: 12 },
  // Result screen
  resultContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  resultIcon: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  resultTitle: { fontSize: 24, fontWeight: '800', color: COLORS.white, marginBottom: 8, textAlign: 'center' },
  resultDesc: { fontSize: 15, color: COLORS.mutedFg, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  premiumBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.primary + '20', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginBottom: 24 },
  premiumBadgeText: { fontSize: 14, fontWeight: '800', color: COLORS.primary, letterSpacing: 1 },
  doneBtn: { backgroundColor: COLORS.primary, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', width: '100%' },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.primaryDark },
});
