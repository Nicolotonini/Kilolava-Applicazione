import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
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
import { Globe, Palette, User, FileSpreadsheet, RefreshCw, KeyRound } from 'lucide-react';
import { Input } from '../components/ui/input';
import { ZonesSettingsCard } from '../components/ZonesSettingsCard';

const SettingsPage = () => {
  const { user, updateUser } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme, isDark } = useTheme();
  const [gsStatus, setGsStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [boxCapacity, setBoxCapacity] = useState(60);
  const [savingCapacity, setSavingCapacity] = useState(false);

  const fetchGsStatus = () => {
    api.get('/integrations/google-sheets/status').then(r => setGsStatus(r.data)).catch(() => setGsStatus({ configured: false, missing: [] }));
  };

  useEffect(() => {
    fetchGsStatus();
    api.get('/settings/keys').then(r => setBoxCapacity(r.data.box_capacity || 60)).catch(() => {});
  }, []);

  const handleSaveCapacity = async () => {
    setSavingCapacity(true);
    try {
      const res = await api.put('/settings/keys', { box_capacity: parseInt(boxCapacity) || 60 });
      setBoxCapacity(res.data.box_capacity);
      toast.success('Capacità box aggiornata');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore');
    } finally { setSavingCapacity(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/integrations/google-sheets/sync');
      toast.success(`${res.data.message} — ${res.data.rows} righe su ${res.data.tabs?.length || 0} fogli`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore di sincronizzazione');
    } finally {
      setSyncing(false);
      fetchGsStatus();
    }
  };

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

      {/* Key Boxes capacity */}
      <Card className="kilolava-card" data-testid="keybox-settings-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-heading">Box Chiavi</CardTitle>
              <CardDescription>Capacità fisica di ogni box (A, B, C)</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div>
              <Label className="text-xs">Posizioni per box</Label>
              <Input
                type="number"
                min={1}
                value={boxCapacity}
                onChange={(e) => setBoxCapacity(e.target.value)}
                className="h-9 w-32 mt-1"
                data-testid="box-capacity-input"
              />
            </div>
            <Button
              onClick={handleSaveCapacity}
              disabled={savingCapacity}
              variant="outline"
              className="h-9"
              data-testid="save-capacity-btn"
            >
              {savingCapacity ? 'Salvataggio...' : 'Salva'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Rioni / Zone operative */}
      <ZonesSettingsCard />

      {/* Google Sheets Integration */}
      <Card className="kilolava-card" data-testid="gsheets-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <FileSpreadsheet className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-heading">Google Fogli</CardTitle>
              <CardDescription>Specchio automatico dei dati operativi (Kilolava → Google Fogli). I dati sensibili non vengono mai sincronizzati.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!gsStatus ? (
            <p className="text-sm text-muted-foreground">Caricamento...</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Stato</p>
                  <p className={`font-medium ${gsStatus.configured ? 'text-emerald-600' : 'text-muted-foreground'}`} data-testid="gsheets-status">
                    {gsStatus.configured ? 'Configurato' : 'Non configurato'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Account Google collegato</p>
                  <p className="font-medium truncate">{gsStatus.service_account_email || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">File collegato</p>
                  <p className="font-medium truncate">{gsStatus.spreadsheet_title || gsStatus.spreadsheet_id || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ultima sincronizzazione</p>
                  <p className="font-medium">
                    {gsStatus.last_sync ? new Date(gsStatus.last_sync).toLocaleString('it-IT') : 'Mai eseguita'}
                    {gsStatus.last_status === 'ok' && gsStatus.synced_rows != null ? ` · ${gsStatus.synced_rows} righe` : ''}
                  </p>
                </div>
              </div>
              {gsStatus.last_status === 'error' && gsStatus.last_error && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2" data-testid="gsheets-error">
                  Errore ultima sincronizzazione: {gsStatus.last_error}
                </p>
              )}
              {!gsStatus.configured && (
                <p className="text-xs text-muted-foreground bg-muted/60 rounded-lg px-3 py-2">
                  Per attivare la sincronizzazione: crea un service account Google con accesso all'API Sheets, aggiungi le variabili {(gsStatus.missing || []).join(' e ')} nella configurazione del backend e condividi il foglio "Kilolava — Dati Operativi" con l'email del service account. Nessuna credenziale viene mai esposta nel frontend.
                </p>
              )}
              <Button
                onClick={handleSync}
                disabled={!gsStatus.configured || syncing}
                className="bg-primary hover:bg-primary/90 text-primary-foreground h-9"
                data-testid="gsheets-sync-btn"
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Sincronizzazione in corso...' : 'Sincronizza ora'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
