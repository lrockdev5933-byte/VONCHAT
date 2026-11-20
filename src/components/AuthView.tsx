import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck, Mail, MessageSquare } from 'lucide-react';
import {
  auth,
  googleProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  formatFirebaseAuthError,
} from '../lib/firebase';
import { VonChatLogo } from './VonChatLogo';

type AuthMode = 'signin' | 'signup';

export function AuthView() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signup') {
        const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        const cleanName = displayName.trim() || trimmedEmail.split('@')[0];
        if (cleanName) {
          await updateProfile(credential.user, { displayName: cleanName });
        }
      } else {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      }
    } catch (err) {
      setErrorMessage(formatFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage(null);
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setErrorMessage(formatFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F8F5] text-[#112419] flex flex-col lg:flex-row">
      {/* Left calm botanical brand panel */}
      <div className="lg:w-[46%] bg-[#0B2316] text-[#ECFDF5] px-8 py-10 lg:px-14 lg:py-14 flex flex-col justify-between relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-32 -left-24 w-96 h-96 rounded-full bg-[#22C55E]/15 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-28 right-0 w-80 h-80 rounded-full bg-[#15803D]/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10">
          <VonChatLogo size="lg" tone="dark" />
        </div>

        <div className="relative z-10 my-10 lg:my-0 max-w-md space-y-6">
          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight leading-tight text-balance text-white">
            Quiet, friendly conversations built for clarity.
          </h1>
          <p className="text-sm lg:text-base text-[#B7DEC6] leading-relaxed">
            Sign in with your email and password to message friends, discover contacts by email, and keep every thread private to its participants.
          </p>

          <div className="pt-4 space-y-4 border-t border-white/10">
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-[#4ADE80] mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Email-only accounts</p>
                <p className="text-xs text-[#A7D3B8]">Create an account with email and password — no phone number required.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-[#4ADE80] mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Participant-only access</p>
                <p className="text-xs text-[#A7D3B8]">Conversations are protected with row-level security so only members can read them.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MessageSquare className="w-4 h-4 text-[#4ADE80] mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Live message updates</p>
                <p className="text-xs text-[#A7D3B8]">Send and receive text messages in real time across your active chats.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs text-[#86B89A]">
          vonChat · Email &amp; password messaging
        </div>
      </div>

      {/* Right authentication form */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-md bg-white border border-[#DCE8E0] rounded-2xl p-7 sm:p-8 shadow-sm">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight text-[#0F291A]">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-1.5 text-sm text-[#4B6856]">
              {mode === 'signin'
                ? 'Sign in with your email and password to open your chats.'
                : 'Start messaging on vonChat using just your email and a password.'}
            </p>
          </div>

          <div
            className="grid grid-cols-2 gap-1 p-1 bg-[#EEF4F0] rounded-xl mb-6"
            role="tablist"
            aria-label="Authentication mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              onClick={() => switchMode('signin')}
              className={`min-h-[40px] text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                mode === 'signin'
                  ? 'bg-white text-[#0F291A] shadow-xs'
                  : 'text-[#4B6856] hover:text-[#0F291A]'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              onClick={() => switchMode('signup')}
              className={`min-h-[40px] text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                mode === 'signup'
                  ? 'bg-white text-[#0F291A] shadow-xs'
                  : 'text-[#4B6856] hover:text-[#0F291A]'
              }`}
            >
              Create account
            </button>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800"
            >
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="auth-display-name"
                  className="block text-sm font-medium text-[#1F3A2A] mb-1.5"
                >
                  Display name
                </label>
                <input
                  id="auth-display-name"
                  type="text"
                  autoComplete="name"
                  placeholder="Alex Rivera"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-[#F9FCFA] border border-[#CFE0D5] rounded-xl text-[#112419] placeholder:text-[#7B9685] focus:outline-none focus:ring-2 focus:ring-[#15803D]/25 focus:border-[#15803D]"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-sm font-medium text-[#1F3A2A] mb-1.5"
              >
                Email address
              </label>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-[#F9FCFA] border border-[#CFE0D5] rounded-xl text-[#112419] placeholder:text-[#7B9685] focus:outline-none focus:ring-2 focus:ring-[#15803D]/25 focus:border-[#15803D]"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-sm font-medium text-[#1F3A2A] mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : 'Enter your password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[44px] pl-3.5 pr-11 py-2.5 text-sm bg-[#F9FCFA] border border-[#CFE0D5] rounded-xl text-[#112419] placeholder:text-[#7B9685] focus:outline-none focus:ring-2 focus:ring-[#15803D]/25 focus:border-[#15803D]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-[#5A7866] hover:text-[#112419] rounded-lg"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[46px] mt-2 px-4 py-2.5 bg-[#15803D] hover:bg-[#166534] disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15803D] focus-visible:ring-offset-2"
            >
              <span>
                {submitting
                  ? mode === 'signin'
                    ? 'Signing in...'
                    : 'Creating account...'
                  : mode === 'signin'
                    ? 'Sign in'
                    : 'Create account'}
              </span>
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-[#E3EDE6]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-[#63806F]">or</span>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleGoogleSignIn}
            className="w-full min-h-[46px] px-4 py-2.5 bg-white hover:bg-[#F5F9F6] disabled:opacity-60 border border-[#CFE0D5] text-[#112419] text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15803D] focus-visible:ring-offset-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
}
