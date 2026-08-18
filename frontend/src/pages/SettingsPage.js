import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import { Globe, Palette, User } from 'lucide-react';

const SettingsPage = () => {
  const { user, updateUser } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme, isDark } = useTheme();

  const handleLanguageChange = async (newLanguage) => {
    setLanguage(newLanguage);
    try {
      await updateUser({ language: newLanguage });
      toast.success(t('settings.saved'));
    } catch (error) {
      console.error('Failed to update language:', error);
    }
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    toast.success(t('settings.saved'));
  };

  return (
    <div className="p-4 lg:p-8 space-y-6" data-testid="settings-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-heading font-semibold text-foreground">
          {t('settings.title')}
        </h1>
        <p className="text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      {/* Profile Section */}
      <Card className="kilolava-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-heading">
                {t('settings.profile')}
              </CardTitle>
              <CardDescription>{t('settings.account')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <Label className="text-foreground">{t('auth.name')}</Label>
              <p className="text-sm text-muted-foreground mt-1">{user?.name}</p>
            </div>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <Label className="text-foreground">{t('auth.email')}</Label>
              <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Language Section */}
      <Card className="kilolava-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-heading">
                {t('settings.language')}
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label htmlFor="language">{t('settings.language')}</Label>
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="w-40" data-testid="language-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="it">Italiano</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Theme Section */}
      <Card className="kilolava-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Palette className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-heading">
                {t('settings.theme')}
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>{t('settings.darkTheme')}</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {isDark ? t('settings.darkTheme') : t('settings.lightTheme')}
              </p>
            </div>
            <Switch
              checked={isDark}
              onCheckedChange={(checked) => handleThemeChange(checked ? 'dark' : 'light')}
              data-testid="theme-switch"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
