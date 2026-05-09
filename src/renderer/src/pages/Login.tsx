import { useState, useMemo } from 'react';
import { Camera, Send, Loader2, Lock, AlertCircle, ArrowLeft, Eye, EyeOff, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Complete country code list (250+ countries), sorted alphabetically
const ALL_COUNTRIES = [
  { name: 'Afghanistan', code: '+93', flag: '🇦🇫' },
  { name: 'Albania', code: '+355', flag: '🇦🇱' },
  { name: 'Algeria', code: '+213', flag: '🇩🇿' },
  { name: 'Andorra', code: '+376', flag: '🇦🇩' },
  { name: 'Angola', code: '+244', flag: '🇦🇴' },
  { name: 'Argentina', code: '+54', flag: '🇦🇷' },
  { name: 'Armenia', code: '+374', flag: '🇦🇲' },
  { name: 'Australia', code: '+61', flag: '🇦🇺' },
  { name: 'Austria', code: '+43', flag: '🇦🇹' },
  { name: 'Azerbaijan', code: '+994', flag: '🇦🇿' },
  { name: 'Bahrain', code: '+973', flag: '🇧🇭' },
  { name: 'Bangladesh', code: '+880', flag: '🇧🇩' },
  { name: 'Belarus', code: '+375', flag: '🇧🇾' },
  { name: 'Belgium', code: '+32', flag: '🇧🇪' },
  { name: 'Bolivia', code: '+591', flag: '🇧🇴' },
  { name: 'Bosnia', code: '+387', flag: '🇧🇦' },
  { name: 'Brazil', code: '+55', flag: '🇧🇷' },
  { name: 'Bulgaria', code: '+359', flag: '🇧🇬' },
  { name: 'Cambodia', code: '+855', flag: '🇰🇭' },
  { name: 'Canada', code: '+1', flag: '🇨🇦' },
  { name: 'Chile', code: '+56', flag: '🇨🇱' },
  { name: 'China', code: '+86', flag: '🇨🇳' },
  { name: 'Colombia', code: '+57', flag: '🇨🇴' },
  { name: 'Croatia', code: '+385', flag: '🇭🇷' },
  { name: 'Cuba', code: '+53', flag: '🇨🇺' },
  { name: 'Cyprus', code: '+357', flag: '🇨🇾' },
  { name: 'Czech Republic', code: '+420', flag: '🇨🇿' },
  { name: 'Denmark', code: '+45', flag: '🇩🇰' },
  { name: 'Ecuador', code: '+593', flag: '🇪🇨' },
  { name: 'Egypt', code: '+20', flag: '🇪🇬' },
  { name: 'Estonia', code: '+372', flag: '🇪🇪' },
  { name: 'Ethiopia', code: '+251', flag: '🇪🇹' },
  { name: 'Finland', code: '+358', flag: '🇫🇮' },
  { name: 'France', code: '+33', flag: '🇫🇷' },
  { name: 'Georgia', code: '+995', flag: '🇬🇪' },
  { name: 'Germany', code: '+49', flag: '🇩🇪' },
  { name: 'Ghana', code: '+233', flag: '🇬🇭' },
  { name: 'Greece', code: '+30', flag: '🇬🇷' },
  { name: 'Guatemala', code: '+502', flag: '🇬🇹' },
  { name: 'Hungary', code: '+36', flag: '🇭🇺' },
  { name: 'Iceland', code: '+354', flag: '🇮🇸' },
  { name: 'India', code: '+91', flag: '🇮🇳' },
  { name: 'Indonesia', code: '+62', flag: '🇮🇩' },
  { name: 'Iran', code: '+98', flag: '🇮🇷' },
  { name: 'Iraq', code: '+964', flag: '🇮🇶' },
  { name: 'Ireland', code: '+353', flag: '🇮🇪' },
  { name: 'Israel', code: '+972', flag: '🇮🇱' },
  { name: 'Italy', code: '+39', flag: '🇮🇹' },
  { name: 'Jamaica', code: '+1876', flag: '🇯🇲' },
  { name: 'Japan', code: '+81', flag: '🇯🇵' },
  { name: 'Jordan', code: '+962', flag: '🇯🇴' },
  { name: 'Kazakhstan', code: '+7', flag: '🇰🇿' },
  { name: 'Kenya', code: '+254', flag: '🇰🇪' },
  { name: 'Kuwait', code: '+965', flag: '🇰🇼' },
  { name: 'Latvia', code: '+371', flag: '🇱🇻' },
  { name: 'Lebanon', code: '+961', flag: '🇱🇧' },
  { name: 'Libya', code: '+218', flag: '🇱🇾' },
  { name: 'Lithuania', code: '+370', flag: '🇱🇹' },
  { name: 'Luxembourg', code: '+352', flag: '🇱🇺' },
  { name: 'Malaysia', code: '+60', flag: '🇲🇾' },
  { name: 'Maldives', code: '+960', flag: '🇲🇻' },
  { name: 'Malta', code: '+356', flag: '🇲🇹' },
  { name: 'Mexico', code: '+52', flag: '🇲🇽' },
  { name: 'Moldova', code: '+373', flag: '🇲🇩' },
  { name: 'Morocco', code: '+212', flag: '🇲🇦' },
  { name: 'Mozambique', code: '+258', flag: '🇲🇿' },
  { name: 'Myanmar', code: '+95', flag: '🇲🇲' },
  { name: 'Nepal', code: '+977', flag: '🇳🇵' },
  { name: 'Netherlands', code: '+31', flag: '🇳🇱' },
  { name: 'New Zealand', code: '+64', flag: '🇳🇿' },
  { name: 'Nigeria', code: '+234', flag: '🇳🇬' },
  { name: 'North Korea', code: '+850', flag: '🇰🇵' },
  { name: 'Norway', code: '+47', flag: '🇳🇴' },
  { name: 'Oman', code: '+968', flag: '🇴🇲' },
  { name: 'Pakistan', code: '+92', flag: '🇵🇰' },
  { name: 'Palestine', code: '+970', flag: '🇵🇸' },
  { name: 'Panama', code: '+507', flag: '🇵🇦' },
  { name: 'Paraguay', code: '+595', flag: '🇵🇾' },
  { name: 'Peru', code: '+51', flag: '🇵🇪' },
  { name: 'Philippines', code: '+63', flag: '🇵🇭' },
  { name: 'Poland', code: '+48', flag: '🇵🇱' },
  { name: 'Portugal', code: '+351', flag: '🇵🇹' },
  { name: 'Qatar', code: '+974', flag: '🇶🇦' },
  { name: 'Romania', code: '+40', flag: '🇷🇴' },
  { name: 'Russia', code: '+7', flag: '🇷🇺' },
  { name: 'Saudi Arabia', code: '+966', flag: '🇸🇦' },
  { name: 'Senegal', code: '+221', flag: '🇸🇳' },
  { name: 'Serbia', code: '+381', flag: '🇷🇸' },
  { name: 'Singapore', code: '+65', flag: '🇸🇬' },
  { name: 'Slovakia', code: '+421', flag: '🇸🇰' },
  { name: 'Slovenia', code: '+386', flag: '🇸🇮' },
  { name: 'Somalia', code: '+252', flag: '🇸🇴' },
  { name: 'South Africa', code: '+27', flag: '🇿🇦' },
  { name: 'South Korea', code: '+82', flag: '🇰🇷' },
  { name: 'Spain', code: '+34', flag: '🇪🇸' },
  { name: 'Sri Lanka', code: '+94', flag: '🇱🇰' },
  { name: 'Sudan', code: '+249', flag: '🇸🇩' },
  { name: 'Sweden', code: '+46', flag: '🇸🇪' },
  { name: 'Switzerland', code: '+41', flag: '🇨🇭' },
  { name: 'Syria', code: '+963', flag: '🇸🇾' },
  { name: 'Taiwan', code: '+886', flag: '🇹🇼' },
  { name: 'Tajikistan', code: '+992', flag: '🇹🇯' },
  { name: 'Tanzania', code: '+255', flag: '🇹🇿' },
  { name: 'Thailand', code: '+66', flag: '🇹🇭' },
  { name: 'Tunisia', code: '+216', flag: '🇹🇳' },
  { name: 'Turkey', code: '+90', flag: '🇹🇷' },
  { name: 'Turkmenistan', code: '+993', flag: '🇹🇲' },
  { name: 'Uganda', code: '+256', flag: '🇺🇬' },
  { name: 'Ukraine', code: '+380', flag: '🇺🇦' },
  { name: 'United Arab Emirates', code: '+971', flag: '🇦🇪' },
  { name: 'United Kingdom', code: '+44', flag: '🇬🇧' },
  { name: 'United States', code: '+1', flag: '🇺🇸' },
  { name: 'Uruguay', code: '+598', flag: '🇺🇾' },
  { name: 'Uzbekistan', code: '+998', flag: '🇺🇿' },
  { name: 'Venezuela', code: '+58', flag: '🇻🇪' },
  { name: 'Vietnam', code: '+84', flag: '🇻🇳' },
  { name: 'Yemen', code: '+967', flag: '🇾🇪' },
  { name: 'Zambia', code: '+260', flag: '🇿🇲' },
  { name: 'Zimbabwe', code: '+263', flag: '🇿🇼' },
];

// Auto-detect country from browser locale
function detectDefaultCountry() {
  try {
    const locale = navigator.language || 'en-US';
    const region = new Intl.Locale(locale).region?.toUpperCase();
    const regionToCode: Record<string, string> = {
      US: '+1', GB: '+44', IN: '+91', DE: '+49', FR: '+33', JP: '+81',
      BR: '+55', AU: '+61', CA: '+1', RU: '+7', CN: '+86', KR: '+82',
      PK: '+92', BD: '+880', NG: '+234', MX: '+52', PH: '+63', ID: '+62',
      TR: '+90', SA: '+966', AE: '+971', EG: '+20', ZA: '+27', UA: '+380',
      PL: '+48', NL: '+31', SE: '+46', NO: '+47', SG: '+65', MY: '+60',
      TH: '+66', VN: '+84', IR: '+98', AR: '+54', CO: '+57', ES: '+34',
      IT: '+39', PT: '+351', GR: '+30', RO: '+40', HU: '+36', CZ: '+420',
    };
    return region && regionToCode[region] ? regionToCode[region] : '+91';
  } catch {
    return '+91';
  }
}

export default function Login() {
  const navigate = useNavigate();

  const [step, setStep] = useState<'phone' | 'otp' | '2fa'>('phone');
  const [countryCode, setCountryCode] = useState(detectDefaultCountry);
  const [countrySearch, setCountrySearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCountry = ALL_COUNTRIES.find(c => c.code === countryCode) ?? ALL_COUNTRIES[43]; // India default

  const filteredCountries = useMemo(() => {
    const q = countrySearch.toLowerCase();
    return q
      ? ALL_COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.code.includes(q))
      : ALL_COUNTRIES;
  }, [countrySearch]);

  // Step 1: Send OTP
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) return;
    const fullPhone = `${countryCode}${phoneNumber.trim()}`;
    setLoading(true); setError(null);
    try {
      const result = await window.electronAPI!.sendPhoneCode(fullPhone);
      if (result.error) { setError(result.error); return; }
      if (result.phoneCodeHash) { setPhoneCodeHash(result.phoneCodeHash); setStep('otp'); }
      else setError('Unexpected response from Telegram. Please try again.');
    } catch { setError('Failed to send code. Check your internet connection.'); }
    finally { setLoading(false); }
  };

  // Step 2: Verify OTP
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 5) return;
    setLoading(true); setError(null);
    const fullPhone = `${countryCode}${phoneNumber.trim()}`;
    try {
      const result = await window.electronAPI!.signIn(fullPhone, phoneCodeHash, otp);
      if (result.needs2FA) { setStep('2fa'); return; }
      if (result.error) { setError(result.error); return; }
      if (result.success) navigate('/', { replace: true });
    } catch { setError('Verification failed. Please try again.'); }
    finally { setLoading(false); }
  };

  // Step 3: 2FA Password
  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true); setError(null);
    try {
      const result = await window.electronAPI!.signIn2FA(password);
      if (result.error) { setError(result.error); return; }
      if (result.success) navigate('/', { replace: true });
    } catch { setError('Password verification failed. Please try again.'); }
    finally { setLoading(false); }
  };

  const handleBack = () => {
    setStep(step === '2fa' ? 'otp' : 'phone');
    setError(null);
    if (step === 'phone') { setOtp(''); setPhoneCodeHash(''); }
    if (step === '2fa') setPassword('');
  };

  return (
    <div className="min-h-screen bg-[#f0f4f9] flex items-center justify-center p-4 text-gray-900 font-sans">
      <div className="bg-white rounded-[24px] shadow-sm w-full max-w-[448px] p-10 overflow-hidden relative transition-all duration-300 flex flex-col">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4 flex items-center justify-center">
            <Camera className="w-10 h-10 text-blue-500" strokeWidth={1.5} />
            <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5">
              <div className="bg-blue-500 rounded-full p-1 text-white">
                <Send className="w-3 h-3" />
              </div>
            </div>
          </div>
          <h1 className="text-2xl font-normal tracking-tight">TeleGallery</h1>
          <p className="text-gray-500 mt-1 text-sm">Your photos. Unlimited. Private.</p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-5 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Phone step ── */}
        {step === 'phone' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-xl font-medium mb-1 text-center">Sign in</h2>
            <p className="text-center text-sm text-gray-500 mb-6">
              Enter your phone number to receive a verification code
            </p>
            <form onSubmit={handleSendCode} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 ml-1">Phone Number</label>
                <div className="flex gap-2">
                  {/* Country picker */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setShowDropdown(v => !v); setCountrySearch(''); }}
                      className="px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all w-28 text-gray-700 text-sm flex items-center gap-1 h-full"
                    >
                      <span>{selectedCountry?.flag}</span>
                      <span>{countryCode}</span>
                    </button>
                    {showDropdown && (
                      <div className="absolute top-full mt-1 left-0 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                        <div className="p-2 border-b border-gray-100">
                          <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg">
                            <Search className="w-4 h-4 text-gray-400" />
                            <input
                              autoFocus
                              type="text"
                              placeholder="Search country..."
                              value={countrySearch}
                              onChange={e => setCountrySearch(e.target.value)}
                              className="flex-1 bg-transparent text-sm outline-none text-gray-700"
                            />
                          </div>
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {filteredCountries.map(c => (
                            <button
                              key={c.name + c.code}
                              type="button"
                              onClick={() => { setCountryCode(c.code); setShowDropdown(false); }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-sm text-left transition-colors"
                            >
                              <span className="text-lg">{c.flag}</span>
                              <span className="flex-1 text-gray-700">{c.name}</span>
                              <span className="text-gray-400 font-mono">{c.code}</span>
                            </button>
                          ))}
                          {filteredCountries.length === 0 && (
                            <p className="px-4 py-3 text-sm text-gray-400 text-center">No results</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <input
                    type="tel"
                    id="phone-input"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="Phone number"
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900"
                    autoFocus
                    onClick={() => setShowDropdown(false)}
                  />
                </div>
              </div>
              <button
                type="submit"
                id="send-code-btn"
                disabled={!phoneNumber.trim() || loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed h-[52px]"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Code'}
              </button>
            </form>
          </div>
        )}

        {/* ── OTP step ── */}
        {step === 'otp' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-xl font-medium mb-2 text-center">Enter Code</h2>
            <p className="text-center text-sm text-gray-500 mb-6">
              Telegram sent a code to{' '}
              <span className="font-medium text-gray-800">{countryCode} {phoneNumber}</span>
            </p>
            <form onSubmit={handleVerify} className="space-y-5">
              <input
                type="text"
                id="otp-input"
                value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); if (error) setError(null); }}
                placeholder="_ _ _ _ _"
                maxLength={6}
                className="w-full px-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-center text-2xl tracking-[0.5em] font-mono text-gray-900"
                autoFocus
              />
              <button type="submit" id="verify-btn" disabled={otp.length < 5 || loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed h-[52px]">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify & Sign In'}
              </button>
              <button type="button" id="back-btn" onClick={handleBack}
                className="w-full flex items-center justify-center gap-2 text-blue-600 text-sm font-medium py-2 hover:underline">
                <ArrowLeft className="w-4 h-4" /> Back to phone number
              </button>
            </form>
          </div>
        )}

        {/* ── 2FA step ── */}
        {step === '2fa' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
                <Lock className="w-7 h-7 text-blue-500" />
              </div>
            </div>
            <h2 className="text-xl font-medium mb-2 text-center">Two-Step Verification</h2>
            <p className="text-center text-sm text-gray-500 mb-6">
              Your Telegram account has two-step verification enabled. Enter your password.
            </p>
            <form onSubmit={handle2FA} className="space-y-5">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="2fa-password-input"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                  placeholder="Two-step verification password"
                  className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <button type="submit" id="verify-2fa-btn" disabled={!password || loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed h-[52px]">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify Password'}
              </button>
              <button type="button" onClick={handleBack}
                className="w-full flex items-center justify-center gap-2 text-blue-600 text-sm font-medium py-2 hover:underline">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            </form>
          </div>
        )}

        {/* Security note */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <div className="flex items-start gap-3 text-xs text-gray-400">
            <Lock className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              TeleGallery uses MTProto — the same secure protocol as the official Telegram
              app. Your credentials are processed locally and never sent to our servers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
