import React, { useEffect, useRef, useState } from 'react';
import { useAuth, getLastUsername } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Sun, Moon, KeyRound, ArrowLeft, ShieldCheck } from 'lucide-react';

const LOGO_URL = 'https://customer-assets.emergentagent.com/job_kilolava-core/artifacts/wuuhyigy_images.png';
const BG_URL = 'https://images.pexels.com/photos/18651506/pexels-photo-18651506.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=1200&w=1920';

const errMsg = (e, fallback) => {
  const d = e?.response?.data?.detail;
  return typeof d === 'string' ? d : fallback;
};

const onlyDigits = (v, max = 6) => v.replace(/\D/g, '').slice(0, max);

const LoginPage = () => {
  const { loginWithPassword, commitSession, pinLogin, activateAccount, loginOptions, setPinRemote } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [mode, setMode] = useState('password'); // password | pin | activate | setpin
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  // attivazione
  const [act, setAct] = useState({ code: '', password: '', password2: '', pin: '', pin2: '' });
  // setup PIN post-login
  const [sp, setSp] = useState({ pin: '', pin2: '' });
  const [wantPinReset, setWantPinReset] = useState(false);
  const pendingRef = useRef(null);
  const pinInputRef = useRef(null);

  useEffect(() => {
    const last = getLastUsername();
    if (last) {
      setUsername(last);
      loginOptions(last)
        .then((o) => { if (o.pin_available) setMode('pin'); })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === 'pin') setTimeout(() => pinInputRef.current?.focus(), 100);
  }, [mode]);

  const submitPin = async (value) => {
    if (loading) return;
    setLoading(true);
    try {
      await pinLogin(username, value);
      toast.success('Benvenuto!');
    } catch (e) {
      setPin('');
      toast.error(errMsg(e, 'PIN errato'));
      if ([403, 429].includes(e?.response?.status)) setMode('password');
    } finally { setLoading(false); }
  };

  const onPinChange = (v) => {
    const d = onlyDigits(v);
    setPin(d);
    if (d.length === 6) submitPin(d);
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (!username.trim()) { toast.error('Inserisci il nome utente'); return; }
    if (!password) { toast.error('Inserisci la password'); return; }
    setLoading(true);
    try {
      const data = await loginWithPassword(username.trim(), password);
      if (!data.pin_set || wantPinReset) {
        pendingRef.current = { data, password };
        setSp({ pin: '', pin2: '' });
        setMode('setpin');
      } else {
        commitSession(data);
        toast.success('Benvenuto!');
      }
    } catch (e2) {
      const msg = errMsg(e2, 'Credenziali non valide');
      toast.error(msg);
      if (e2?.response?.status === 403 && msg.includes('attivare')) setMode('activate');
    } finally { setLoading(false); }
  };

  const saveNewPin = async () => {
    if (!/^\d{6}$/.test(sp.pin)) { toast.error('Il PIN deve essere di 6 cifre'); return; }
    if (sp.pin !== sp.pin2) { toast.error('I PIN non coincidono'); return; }
    setLoading(true);
    try {
      const { data, password: pwd } = pendingRef.current;
      await setPinRemote(pwd, sp.pin, data.access_token);
      commitSession(data);
      toast.success('PIN impostato: dal prossimo accesso su questo dispositivo basta il PIN');
    } catch (e) { toast.error(errMsg(e, 'Errore impostazione PIN')); }
    finally { setLoading(false); }
  };

  const skipPin = () => {
    if (pendingRef.current) commitSession(pendingRef.current.data);
  };

  const submitActivate = async (e) => {
    e.preventDefault();
    if (!username.trim()) { toast.error('Inserisci il nome utente'); return; }
    if (!act.code.trim()) { toast.error('Inserisci il codice di attivazione'); return; }
    if (act.password.length < 8) { toast.error('La password deve avere almeno 8 caratteri'); return; }
    if (act.password !== act.password2) { toast.error('Le password non coincidono'); return; }
    if (!/^\d{6}$/.test(act.pin)) { toast.error('Il PIN deve essere di 6 cifre'); return; }
    if (act.pin !== act.pin2) { toast.error('I PIN non coincidono'); return; }
    setLoading(true);
    try {
      await activateAccount({ username: username.trim(), code: act.code.trim(), newPassword: act.password, pin: act.pin });
      toast.success('Account attivato: benvenuto!');
    } catch (e2) { toast.error(errMsg(e2, 'Attivazione non riuscita')); }
    finally { setLoading(false); }
  };

  const changeUser = () => {
    setUsername('');
    setPin('');
    setMode('password');
  };

  const UsernameField = (
    <div className="space-y-2">
      <Label htmlFor="username">Nome utente</Label>
      <Input
        id="username"
        type="text"
        placeholder="nome.cognome@kilolava.it"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        data-testid="login-username-input"
        className="h-11"
        autoComplete="username"
        autoCapitalize="none"
      />
    </div>
  );

  return (
    <div className="min-h-screen relative flex items-center justify-center">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${BG_URL})` }}>
        <div className="absolute inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-[2px]" />
      </div>

      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="theme-toggle-login"
          className="bg-white/50 dark:bg-black/50 backdrop-blur-sm">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white dark:bg-card rounded-2xl shadow-2xl shadow-black/10 p-8 sm:p-10 border border-white/80 dark:border-border">
          <div className="flex justify-center mb-6">
            <img src={LOGO_URL} alt="Kilolava" className="h-20 object-contain" data-testid="login-logo" />
          </div>

          {/* ================= PIN ================= */}
          {mode === 'pin' && (
            <div data-testid="pin-login-panel">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-heading font-semibold text-foreground">Ciao!</h1>
                <p className="mt-1.5 text-sm text-muted-foreground break-all" data-testid="pin-login-username">{username}</p>
                <p className="mt-1 text-xs text-muted-foreground">Inserisci il PIN di 6 cifre di questo dispositivo</p>
              </div>
              <Input
                ref={pinInputRef}
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={pin}
                onChange={(e) => onPinChange(e.target.value)}
                disabled={loading}
                className="h-14 text-center text-3xl tracking-[0.6em] font-bold"
                placeholder="••••••"
                data-testid="pin-input"
              />
              <div className="mt-6 space-y-2 text-center">
                <button type="button" onClick={() => { setWantPinReset(false); setMode('password'); }}
                  className="text-sm text-[#F24E75] font-medium hover:underline block w-full" data-testid="use-password-btn">
                  Usa la password
                </button>
                <button type="button" onClick={() => { setWantPinReset(true); setMode('password'); toast.info('Accedi con la password: poi potrai impostare un nuovo PIN'); }}
                  className="text-xs text-muted-foreground hover:underline block w-full" data-testid="forgot-pin-btn">
                  PIN dimenticato? Reimpostalo con la password
                </button>
                <button type="button" onClick={changeUser}
                  className="text-xs text-muted-foreground hover:underline block w-full" data-testid="change-user-btn">
                  Non sei tu? Cambia utente
                </button>
              </div>
            </div>
          )}

          {/* ================= PASSWORD ================= */}
          {mode === 'password' && (
            <div data-testid="password-login-panel">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-heading font-semibold text-foreground">Accedi a Kilolava</h1>
                <p className="mt-2 text-sm text-muted-foreground">Gestionale operativo interno</p>
              </div>
              <form onSubmit={submitPassword} className="space-y-5">
                {UsernameField}
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      data-testid="login-password-input"
                      className="h-11 pr-10"
                      autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      data-testid="toggle-password">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 bg-[#F24E75] hover:bg-[#E03B62] text-white font-medium"
                  disabled={loading} data-testid="login-btn">
                  {loading ? 'Accesso…' : 'Accedi'}
                </Button>
              </form>
              <div className="mt-6 text-center space-y-2">
                <button type="button" onClick={() => setMode('activate')}
                  className="text-sm text-[#F24E75] font-medium hover:underline inline-flex items-center gap-1.5"
                  data-testid="activation-link">
                  <KeyRound className="h-3.5 w-3.5" />Prima attivazione: ho un codice
                </button>
              </div>
            </div>
          )}

          {/* ================= ATTIVAZIONE ================= */}
          {mode === 'activate' && (
            <div data-testid="activation-panel">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-heading font-semibold text-foreground">Prima attivazione</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Inserisci il nome utente e il codice monouso ricevuto, poi scegli password e PIN.
                </p>
              </div>
              <form onSubmit={submitActivate} className="space-y-4">
                {UsernameField}
                <div className="space-y-2">
                  <Label htmlFor="act-code">Codice di attivazione</Label>
                  <Input id="act-code" value={act.code}
                    onChange={(e) => setAct((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="XXXX-XXXX" className="h-11 font-mono tracking-widest" autoComplete="off"
                    data-testid="act-code-input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="act-pwd">Nuova password</Label>
                    <Input id="act-pwd" type="password" value={act.password}
                      onChange={(e) => setAct((f) => ({ ...f, password: e.target.value }))}
                      className="h-11" autoComplete="new-password" data-testid="act-password-input" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="act-pwd2">Conferma password</Label>
                    <Input id="act-pwd2" type="password" value={act.password2}
                      onChange={(e) => setAct((f) => ({ ...f, password2: e.target.value }))}
                      className="h-11" autoComplete="new-password" data-testid="act-password2-input" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="act-pin">PIN (6 cifre)</Label>
                    <Input id="act-pin" type="password" inputMode="numeric" maxLength={6} value={act.pin}
                      onChange={(e) => setAct((f) => ({ ...f, pin: onlyDigits(e.target.value) }))}
                      className="h-11 text-center tracking-[0.4em]" data-testid="act-pin-input" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="act-pin2">Conferma PIN</Label>
                    <Input id="act-pin2" type="password" inputMode="numeric" maxLength={6} value={act.pin2}
                      onChange={(e) => setAct((f) => ({ ...f, pin2: onlyDigits(e.target.value) }))}
                      className="h-11 text-center tracking-[0.4em]" data-testid="act-pin2-input" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Il PIN varrà solo su questo dispositivo. La password serve per i nuovi dispositivi.
                </p>
                <Button type="submit" className="w-full h-11 bg-[#F24E75] hover:bg-[#E03B62] text-white font-medium"
                  disabled={loading} data-testid="act-submit-btn">
                  {loading ? 'Attivazione…' : 'Attiva account'}
                </Button>
              </form>
              <div className="mt-5 text-center">
                <button type="button" onClick={() => setMode('password')}
                  className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
                  data-testid="back-to-login-btn">
                  <ArrowLeft className="h-3.5 w-3.5" />Torna al login
                </button>
              </div>
            </div>
          )}

          {/* ================= SETUP PIN POST-LOGIN ================= */}
          {mode === 'setpin' && (
            <div data-testid="setpin-panel">
              <div className="text-center mb-6">
                <div className="mx-auto w-11 h-11 rounded-full bg-[#F24E75]/10 flex items-center justify-center mb-3">
                  <ShieldCheck className="h-5 w-5 text-[#F24E75]" />
                </div>
                <h1 className="text-2xl font-heading font-semibold text-foreground">Imposta il PIN</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Su questo dispositivo autorizzato potrai accedere con un PIN di 6 cifre invece della password.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>PIN (6 cifre)</Label>
                  <Input type="password" inputMode="numeric" maxLength={6} value={sp.pin}
                    onChange={(e) => setSp((f) => ({ ...f, pin: onlyDigits(e.target.value) }))}
                    className="h-11 text-center tracking-[0.4em]" data-testid="setpin-pin-input" />
                </div>
                <div className="space-y-2">
                  <Label>Conferma PIN</Label>
                  <Input type="password" inputMode="numeric" maxLength={6} value={sp.pin2}
                    onChange={(e) => setSp((f) => ({ ...f, pin2: onlyDigits(e.target.value) }))}
                    className="h-11 text-center tracking-[0.4em]" data-testid="setpin-pin2-input" />
                </div>
              </div>
              <Button onClick={saveNewPin} disabled={loading}
                className="w-full h-11 mt-5 bg-[#F24E75] hover:bg-[#E03B62] text-white font-medium"
                data-testid="setpin-save-btn">
                {loading ? 'Salvataggio…' : 'Salva PIN ed entra'}
              </Button>
              <button type="button" onClick={skipPin}
                className="mt-3 w-full text-sm text-muted-foreground hover:underline" data-testid="setpin-skip-btn">
                Salta per ora
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
