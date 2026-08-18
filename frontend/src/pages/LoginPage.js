import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Sun, Moon } from 'lucide-react';

const LOGO_URL = 'https://customer-assets.emergentagent.com/job_kilolava-core/artifacts/wuuhyigy_images.png';
const BG_URL = 'https://images.pexels.com/photos/18651506/pexels-photo-18651506.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=1200&w=1920';

const LoginPage = () => {
  const { login } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) { toast.error(t('auth.emailRequired')); return; }
    if (!password) { toast.error(t('auth.passwordRequired')); return; }
    setLoading(true);
    try {
      await login(email, password);
      toast.success(`${t('dashboard.welcome')}!`);
    } catch (error) {
      console.error('Login error:', error);
      toast.error(t('auth.invalidCredentials'));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center">
      {/* Full-screen background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${BG_URL})` }}
      >
        <div className="absolute inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-[2px]" />
      </div>

      {/* Top controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLanguage(language === 'it' ? 'en' : 'it')}
          data-testid="language-toggle"
          className="text-foreground/70 bg-white/50 dark:bg-black/50 backdrop-blur-sm"
        >
          {language === 'it' ? 'EN' : 'IT'}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          data-testid="theme-toggle-login"
          className="bg-white/50 dark:bg-black/50 backdrop-blur-sm"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      {/* Centered login card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white dark:bg-card rounded-2xl shadow-2xl shadow-black/10 p-8 sm:p-10 border border-white/80 dark:border-border">
          {/* Logo centered */}
          <div className="flex justify-center mb-8">
            <img
              src={LOGO_URL}
              alt="Kilolava"
              className="h-24 object-contain"
              data-testid="login-logo"
            />
          </div>

          {/* Title centered */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-heading font-semibold text-foreground">
              {t('auth.loginTitle')}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('auth.loginSubtitle')}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@esempio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="email-input"
                className="h-11"
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="password-input"
                  className="h-11 pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="toggle-password"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-[#F24E75] hover:bg-[#E03B62] text-white font-medium"
              disabled={loading}
              data-testid="login-btn"
            >
              {loading ? t('common.loading') : t('auth.login')}
            </Button>
          </form>

          {/* Register link */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t('auth.noAccount')}{' '}
            <Link
              to="/register"
              className="text-[#F24E75] font-medium hover:underline"
              data-testid="register-link"
            >
              {t('auth.register')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
