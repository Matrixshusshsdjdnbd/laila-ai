import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  SafeAreaView, ActivityIndicator, Alert, TextInput, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const C = {
  bg: '#0A0908', card: '#141311', primary: '#FFC107', primaryDark: '#422006',
  muted: '#27272A', mutedFg: '#A1A1AA', white: '#FFFFFF', text: '#E4E4E7',
  secondaryFg: '#FDE68A', success: '#22C55E', wave: '#1DC3DC', orange: '#FF6600',
  stripe: '#635BFF',
};

type Plan = { id: string; name: string; price: number; price_display: string; currency: string; duration_days: number; description: string; region: string; popular?: boolean; savings?: string };

export default function PremiumScreen() {
  const [region, setRegion] = useState<'africa' | 'international'>('africa');
  const [plansAfrica, setPlansAfrica] = useState<Plan[]>([]);
  const [plansIntl, setPlansIntl] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentResult, setPaymentResult] = useState<'success' | 'failed' | null>(null);
  const [userTier, setUserTier] = useState('free');
  const [step, setStep] = useState<'plans' | 'payment' | 'result'>('plans');
  const params = useLocalSearchParams();

  useEffect(() => { loadData(); }, []);

  // Check for Stripe return
  useEffect(() => {
    if (params.session_id) { pollStripeStatus(params.session_id as string); }
  }, [params.session_id]);

  const getAuth = async () => {
    const token = await AsyncStorage.getItem('laila_auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadData = async () => {
    try {
      const h = await getAuth();
      const [pR, mR] = await Promise.all([
        fetch(`${BACKEND_URL}/api/payment/plans`),
        fetch(`${BACKEND_URL}/api/auth/me`, { headers: h }),
      ]);
      if (pR.ok) { const d = await pR.json(); setPlansAfrica(d.plans_africa || []); setPlansIntl(d.plans_international || []); }
      if (mR.ok) { const d = await mR.json(); setUserTier(d.tier); }
    } catch {}
  };

  const pollStripeStatus = async (sessionId: string, attempts = 0) => {
    if (attempts >= 5) { setPaymentResult('failed'); setStep('result'); return; }
    try {
      const h = await getAuth();
      const res = await fetch(`${BACKEND_URL}/api/payment/checkout/status/${sessionId}`, { headers: h });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.payment_status === 'paid') { setPaymentResult('success'); setUserTier('premium'); setStep('result'); return; }
      if (data.status === 'expired') { setPaymentResult('failed'); setStep('result'); return; }
      setTimeout(() => pollStripeStatus(sessionId, attempts + 1), 2000);
    } catch { setPaymentResult('failed'); setStep('result'); }
  };

  const initPayment = async () => {
    if (!selectedPlan || !paymentMethod) return;
    setLoading(true);
    try {
      const h = await getAuth();
      const originUrl = BACKEND_URL || '';
      const res = await fetch(`${BACKEND_URL}/api/payment/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify({ plan_id: selectedPlan, payment_method: paymentMethod, phone_number: phoneNumber, origin_url: originUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);

      if (data.checkout_url) {
        // Stripe: open checkout in browser
        await Linking.openURL(data.checkout_url);
        setStep('result');
        setPaymentResult(null); // Will poll when returning
      } else if (data.status === 'completed') {
        setPaymentResult('success');
        setUserTier('premium');
        setStep('result');
      } else {
        setPaymentResult('failed');
        setStep('result');
      }
    } catch (err: any) {
      setPaymentResult('failed');
      setStep('result');
    } finally {
      setLoading(false);
    }
  };

  const resetFlow = () => { setStep('plans'); setSelectedPlan(null); setPaymentMethod(null); setPaymentResult(null); setPhoneNumber(''); };
  const plans = region === 'africa' ? plansAfrica : plansIntl;
  const selectedPlanData = [...plansAfrica, ...plansIntl].find(p => p.id === selectedPlan);

  // ─── Result ────────────
  if (step === 'result') {
    const ok = paymentResult === 'success';
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.resultContent}>
          <View style={[s.resultIcon, { backgroundColor: ok ? C.success + '20' : '#EF444420' }]}>
            <Ionicons name={ok ? 'checkmark-circle' : paymentResult === null ? 'hourglass' : 'close-circle'} size={64} color={ok ? C.success : paymentResult === null ? C.primary : '#EF4444'} />
          </View>
          <Text style={s.resultTitle}>{ok ? 'Payment Successful!' : paymentResult === null ? 'Processing...' : 'Payment Failed'}</Text>
          <Text style={s.resultDesc}>{ok ? 'Welcome to LAILA AI Premium!' : paymentResult === null ? 'Checking your payment status...' : 'Please try again.'}</Text>
          {ok && <View style={s.premBadge}><Ionicons name="star" size={20} color={C.primary} /><Text style={s.premBadgeText}>PREMIUM ACTIVE</Text></View>}
          {paymentResult !== null && <TouchableOpacity testID="result-done-btn" style={s.doneBtn} onPress={resetFlow}><Text style={s.doneBtnText}>{ok ? 'Done' : 'Try Again'}</Text></TouchableOpacity>}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Payment ────────────
  if (step === 'payment' && selectedPlanData) {
    const isAfrica = selectedPlanData.region === 'africa';
    return (
      <SafeAreaView style={s.container}>
        <View style={s.hdr}><TouchableOpacity testID="back-to-plans" onPress={() => setStep('plans')} style={s.backBtn}><Ionicons name="arrow-back" size={24} color={C.white} /></TouchableOpacity><Text style={s.hdrTitle}>Payment</Text></View>
        <ScrollView contentContainerStyle={s.payContent}>
          <View style={s.planSummary}><Text style={s.summaryLabel}>Selected Plan</Text><Text style={s.summaryPlan}>{selectedPlanData.name} — {selectedPlanData.price_display}</Text><Text style={s.summaryDur}>{selectedPlanData.description}</Text></View>
          <Text style={s.secTitle}>Choose Payment Method</Text>
          {isAfrica ? (<>
            <TouchableOpacity testID="pay-wave" style={[s.methodCard, paymentMethod === 'wave' && s.methodActive]} onPress={() => setPaymentMethod('wave')}>
              <View style={[s.methodIcon, { backgroundColor: C.wave + '20' }]}><Ionicons name="wallet" size={24} color={C.wave} /></View>
              <View style={{ flex: 1 }}><Text style={s.methodName}>Wave</Text><Text style={s.methodDesc}>Mobile money</Text></View>
              <View style={[s.radio, paymentMethod === 'wave' && s.radioOn]}>{paymentMethod === 'wave' && <View style={s.radioDot} />}</View>
            </TouchableOpacity>
            <TouchableOpacity testID="pay-orange" style={[s.methodCard, paymentMethod === 'orange_money' && s.methodActive]} onPress={() => setPaymentMethod('orange_money')}>
              <View style={[s.methodIcon, { backgroundColor: C.orange + '20' }]}><Ionicons name="phone-portrait" size={24} color={C.orange} /></View>
              <View style={{ flex: 1 }}><Text style={s.methodName}>Orange Money</Text><Text style={s.methodDesc}>Mobile money</Text></View>
              <View style={[s.radio, paymentMethod === 'orange_money' && s.radioOn]}>{paymentMethod === 'orange_money' && <View style={s.radioDot} />}</View>
            </TouchableOpacity>
            {paymentMethod && <View style={s.phoneWrap}><Text style={s.phoneLabel}>Phone Number</Text><TextInput testID="phone-input" style={s.phoneInput} placeholder="+221 77 000 00 00" placeholderTextColor={C.mutedFg} value={phoneNumber} onChangeText={setPhoneNumber} keyboardType="phone-pad" /></View>}
          </>) : (
            <TouchableOpacity testID="pay-card" style={[s.methodCard, paymentMethod === 'card' && s.methodActive]} onPress={() => setPaymentMethod('card')}>
              <View style={[s.methodIcon, { backgroundColor: C.stripe + '20' }]}><Ionicons name="card" size={24} color={C.stripe} /></View>
              <View style={{ flex: 1 }}><Text style={s.methodName}>Credit / Debit Card</Text><Text style={s.methodDesc}>Secure payment via Stripe</Text></View>
              <View style={[s.radio, paymentMethod === 'card' && s.radioOn]}>{paymentMethod === 'card' && <View style={s.radioDot} />}</View>
            </TouchableOpacity>
          )}
          <TouchableOpacity testID="confirm-payment-btn" style={[s.payBtn, (!paymentMethod || loading) && s.payBtnOff]} onPress={initPayment} disabled={!paymentMethod || loading}>
            {loading ? <ActivityIndicator size="small" color={C.primaryDark} /> : <><Ionicons name="shield-checkmark" size={20} color={C.primaryDark} /><Text style={s.payBtnText}>Pay {selectedPlanData.price_display}</Text></>}
          </TouchableOpacity>
          <Text style={s.secureText}>Secure payment · Cancel anytime</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Plans ────────────
  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.plansContent} showsVerticalScrollIndicator={false}>
        <View style={s.premHeader}>
          <View style={s.crownCircle}><Ionicons name="star" size={32} color={C.primary} /></View>
          <Text style={s.premTitle}>LAILA AI Premium</Text>
          <Text style={s.premDesc}>Unlimited AI power for your life</Text>
        </View>
        {userTier === 'premium' && <View style={s.activeBadge}><Ionicons name="checkmark-circle" size={20} color={C.success} /><Text style={s.activeText}>Premium Active</Text></View>}
        {/* Region Selector */}
        <View style={s.regionRow}>
          <TouchableOpacity testID="region-africa" style={[s.regionTab, region === 'africa' && s.regionActive]} onPress={() => { setRegion('africa'); setSelectedPlan(null); setPaymentMethod(null); }}>
            <Text style={[s.regionText, region === 'africa' && s.regionTextActive]}>Africa (FCFA)</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="region-intl" style={[s.regionTab, region === 'international' && s.regionActive]} onPress={() => { setRegion('international'); setSelectedPlan(null); setPaymentMethod(null); }}>
            <Text style={[s.regionText, region === 'international' && s.regionTextActive]}>International (EUR)</Text>
          </TouchableOpacity>
        </View>
        {/* Features */}
        <Text style={s.featTitle}>Premium includes:</Text>
        {[{ icon: 'infinite', t: 'Unlimited chat & translation' }, { icon: 'image', t: 'Unlimited image generation' }, { icon: 'mic', t: 'Unlimited voice features' }, { icon: 'school', t: 'Advanced AI assistants' }, { icon: 'flash', t: 'Faster responses' }].map((f, i) => (
          <View key={i} style={s.featRow}><Ionicons name={f.icon as any} size={20} color={C.primary} /><Text style={s.featText}>{f.t}</Text></View>
        ))}
        {/* Plans */}
        <Text style={s.plansLabel}>Choose your plan</Text>
        {plans.map(plan => (
          <TouchableOpacity key={plan.id} testID={`plan-${plan.id}`} style={[s.planCard, selectedPlan === plan.id && s.planActive, plan.popular && s.planPopular]} onPress={() => setSelectedPlan(plan.id)}>
            {plan.popular && <View style={s.popTag}><Text style={s.popTagText}>BEST VALUE</Text></View>}
            <View style={s.planRow}>
              <View style={[s.planRadio, selectedPlan === plan.id && s.planRadioOn]}>{selectedPlan === plan.id && <View style={s.planDot} />}</View>
              <View style={{ flex: 1 }}><Text style={s.planName}>{plan.name}</Text><Text style={s.planDur}>{plan.description}</Text></View>
              <Text style={s.planPrice}>{plan.price_display}</Text>
            </View>
            {plan.savings && <Text style={s.savings}>{plan.savings}</Text>}
          </TouchableOpacity>
        ))}
        {userTier !== 'premium' && <TouchableOpacity testID="continue-to-payment-btn" style={[s.continueBtn, !selectedPlan && s.continueBtnOff]} onPress={() => { if (selectedPlan) { setPaymentMethod(null); setStep('payment'); } }} disabled={!selectedPlan}><Text style={s.continueBtnText}>Continue to Payment</Text><Ionicons name="arrow-forward" size={20} color={C.primaryDark} /></TouchableOpacity>}
        {/* Payment method badges */}
        <View style={s.badges}>
          {region === 'africa' ? (<>
            <View style={[s.badge, { backgroundColor: C.wave + '15' }]}><Ionicons name="wallet" size={14} color={C.wave} /><Text style={[s.badgeText, { color: C.wave }]}>Wave</Text></View>
            <View style={[s.badge, { backgroundColor: C.orange + '15' }]}><Ionicons name="phone-portrait" size={14} color={C.orange} /><Text style={[s.badgeText, { color: C.orange }]}>Orange Money</Text></View>
          </>) : (
            <View style={[s.badge, { backgroundColor: C.stripe + '15' }]}><Ionicons name="card" size={14} color={C.stripe} /><Text style={[s.badgeText, { color: C.stripe }]}>Stripe · Visa · Mastercard</Text></View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  plansContent: { padding: 20, paddingTop: Platform.OS === 'android' ? 44 : 12, paddingBottom: 40 },
  premHeader: { alignItems: 'center', marginBottom: 16 },
  crownCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.primary + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  premTitle: { fontSize: 26, fontWeight: '800', color: C.white },
  premDesc: { fontSize: 14, color: C.mutedFg },
  activeBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.success + '15', paddingVertical: 10, borderRadius: 12, marginBottom: 16 },
  activeText: { fontSize: 15, fontWeight: '700', color: C.success },
  regionRow: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 12, padding: 4, marginBottom: 20 },
  regionTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  regionActive: { backgroundColor: C.primary },
  regionText: { fontSize: 13, fontWeight: '600', color: C.mutedFg },
  regionTextActive: { color: C.primaryDark },
  featTitle: { fontSize: 14, fontWeight: '700', color: C.white, marginBottom: 10 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  featText: { fontSize: 14, color: C.text },
  plansLabel: { fontSize: 14, fontWeight: '700', color: C.white, marginTop: 16, marginBottom: 10 },
  planCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.muted },
  planActive: { borderColor: C.primary },
  planPopular: { borderColor: C.primary + '50' },
  popTag: { position: 'absolute', top: -10, right: 14, backgroundColor: C.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  popTagText: { fontSize: 9, fontWeight: '800', color: C.primaryDark, letterSpacing: 0.5 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  planRadioOn: { borderColor: C.primary },
  planDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },
  planName: { fontSize: 15, fontWeight: '700', color: C.white },
  planDur: { fontSize: 11, color: C.mutedFg },
  planPrice: { fontSize: 20, fontWeight: '800', color: C.primary },
  savings: { fontSize: 11, color: C.success, fontWeight: '600', marginTop: 4, marginLeft: 30 },
  continueBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 26, backgroundColor: C.primary, marginTop: 14 },
  continueBtnOff: { opacity: 0.4 },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: C.primaryDark },
  badges: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  // Payment screen
  hdr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 44 : 12, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: C.muted },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hdrTitle: { fontSize: 20, fontWeight: '700', color: C.white },
  payContent: { padding: 20, paddingBottom: 40 },
  planSummary: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 0.5, borderColor: C.primary + '30' },
  summaryLabel: { fontSize: 11, color: C.mutedFg, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryPlan: { fontSize: 17, fontWeight: '700', color: C.white, marginTop: 2 },
  summaryDur: { fontSize: 12, color: C.mutedFg, marginTop: 2 },
  secTitle: { fontSize: 15, fontWeight: '700', color: C.white, marginBottom: 10 },
  methodCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.muted },
  methodActive: { borderColor: C.primary },
  methodIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  methodName: { fontSize: 15, fontWeight: '700', color: C.white },
  methodDesc: { fontSize: 11, color: C.mutedFg },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },
  phoneWrap: { marginTop: 12 },
  phoneLabel: { fontSize: 12, color: C.mutedFg, marginBottom: 6 },
  phoneInput: { backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 10, fontSize: 15, color: C.white, borderWidth: 0.5, borderColor: C.muted },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 26, backgroundColor: C.primary, marginTop: 16 },
  payBtnOff: { opacity: 0.4 },
  payBtnText: { fontSize: 16, fontWeight: '700', color: C.primaryDark },
  secureText: { fontSize: 12, color: C.mutedFg, textAlign: 'center', marginTop: 10 },
  // Result
  resultContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  resultIcon: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  resultTitle: { fontSize: 22, fontWeight: '800', color: C.white, marginBottom: 6, textAlign: 'center' },
  resultDesc: { fontSize: 14, color: C.mutedFg, textAlign: 'center', marginBottom: 20 },
  premBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary + '20', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, marginBottom: 20 },
  premBadgeText: { fontSize: 13, fontWeight: '800', color: C.primary, letterSpacing: 1 },
  doneBtn: { backgroundColor: C.primary, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', width: '100%' },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: C.primaryDark },
});
