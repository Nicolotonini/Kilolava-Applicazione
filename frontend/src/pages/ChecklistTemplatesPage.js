import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Plus, X, Pencil, Trash2, GripVertical, ClipboardList,
  CheckSquare, ToggleLeft, Type, Hash, Camera, GitBranch, ChevronDown, ChevronUp
} from 'lucide-react';
import { cn } from '../lib/utils';

const ITEM_TYPE_CONFIG = {
  checkbox: { label: 'Checkbox', icon: CheckSquare, color: 'text-blue-600' },
  yesno: { label: 'Si/No', icon: ToggleLeft, color: 'text-green-600' },
  text: { label: 'Testo', icon: Type, color: 'text-purple-600' },
  number: { label: 'Numerico', icon: Hash, color: 'text-amber-600' },
  photo: { label: 'Foto', icon: Camera, color: 'text-pink-600' },
  conditional: { label: 'Condizionale', icon: GitBranch, color: 'text-teal-600' },
};

const SidePanel = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full sm:w-[55%] lg:w-[42%] bg-card border-l border-border z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30 flex-shrink-0">
          <h2 className="font-heading font-semibold text-base">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
};

const ChecklistTemplatesPage = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: '' });
  const [saving, setSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState(null);

  const [form, setForm] = useState({ name: '', description: '', structure_id: '', unit_id: '', sections: [] });

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await api.get('/checklist-templates');
      setTemplates(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const openNew = () => {
    setEditTemplate(null);
    setForm({
      name: '', description: '', structure_id: '', unit_id: '',
      sections: [
        { name: 'Ispezione Iniziale', order: 0, items: [{ label: 'Foto iniziale', item_type: 'photo', required: true, order: 0 }] },
        { name: 'Pulizia', order: 1, items: [] },
        { name: 'Controllo Finale', order: 2, items: [{ label: 'Foto finale', item_type: 'photo', required: true, order: 0 }, { label: 'Tutto in ordine', item_type: 'yesno', required: true, order: 1 }] },
      ],
    });
    setExpandedSection(1);
    setPanel(true);
  };

  const openEdit = (t) => {
    setEditTemplate(t);
    setForm({
      name: t.name || '', description: t.description || '',
      structure_id: t.structure_id || '', unit_id: t.unit_id || '',
      sections: t.sections || [],
    });
    setExpandedSection(0);
    setPanel(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast.error('Nome richiesto'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        structure_id: form.structure_id || null,
        unit_id: form.unit_id || null,
      };
      if (editTemplate) {
        await api.put(`/checklist-templates/${editTemplate.id}`, payload);
        toast.success('Template aggiornato');
      } else {
        await api.post('/checklist-templates', payload);
        toast.success('Template creato');
      }
      setPanel(false);
      fetchTemplates();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/checklist-templates/${deleteDialog.id}`);
      toast.success('Template eliminato');
      setDeleteDialog({ open: false, id: '' });
      fetchTemplates();
    } catch (e) { toast.error('Errore'); }
  };

  // Section management
  const addSection = () => {
    setForm(p => ({
      ...p,
      sections: [...p.sections, { name: `Sezione ${p.sections.length + 1}`, order: p.sections.length, items: [] }],
    }));
    setExpandedSection(form.sections.length);
  };

  const updateSection = (idx, field, value) => {
    setForm(p => {
      const s = [...p.sections];
      s[idx] = { ...s[idx], [field]: value };
      return { ...p, sections: s };
    });
  };

  const removeSection = (idx) => {
    setForm(p => ({ ...p, sections: p.sections.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })) }));
  };

  const moveSection = (idx, dir) => {
    setForm(p => {
      const s = [...p.sections];
      const target = idx + dir;
      if (target < 0 || target >= s.length) return p;
      [s[idx], s[target]] = [s[target], s[idx]];
      return { ...p, sections: s.map((sec, i) => ({ ...sec, order: i })) };
    });
    setExpandedSection(idx + dir);
  };

  // Item management
  const addItem = (sectionIdx, itemType = 'checkbox') => {
    setForm(p => {
      const s = [...p.sections];
      const items = [...(s[sectionIdx].items || [])];
      items.push({ label: '', item_type: itemType, required: false, order: items.length });
      s[sectionIdx] = { ...s[sectionIdx], items };
      return { ...p, sections: s };
    });
  };

  const updateItem = (sectionIdx, itemIdx, field, value) => {
    setForm(p => {
      const s = [...p.sections];
      const items = [...s[sectionIdx].items];
      items[itemIdx] = { ...items[itemIdx], [field]: value };
      s[sectionIdx] = { ...s[sectionIdx], items };
      return { ...p, sections: s };
    });
  };

  const removeItem = (sectionIdx, itemIdx) => {
    setForm(p => {
      const s = [...p.sections];
      const items = s[sectionIdx].items.filter((_, i) => i !== itemIdx).map((it, i) => ({ ...it, order: i }));
      s[sectionIdx] = { ...s[sectionIdx], items };
      return { ...p, sections: s };
    });
  };

  const totalItems = (t) => (t.sections || []).reduce((sum, s) => sum + (s.items?.length || 0), 0);

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="checklist-templates-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Template Checklist</h1>
          <p className="text-sm text-muted-foreground">{templates.length} template disponibili</p>
        </div>
        <Button onClick={openNew} className="h-8 bg-[#F24E75] hover:bg-[#E03B62] text-white gap-1" data-testid="add-template-btn">
          <Plus className="h-4 w-4" />Nuovo template
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nessun template. Crea il primo!</p>
          <Button onClick={openNew} variant="outline" className="mt-3 gap-1"><Plus className="h-4 w-4" />Crea template</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(t => (
            <Card key={t.id} className="border hover:ring-1 hover:ring-[#F24E75]/30 transition-all" data-testid={`template-${t.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold">{t.name}</h3>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteDialog({ open: true, id: t.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>{(t.sections || []).length} sezioni</span>
                  <span>{totalItems(t)} item</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {(t.sections || []).map((s, i) => (
                    <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full">{s.name}</span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Template Editor Panel */}
      <SidePanel open={panel} onClose={() => setPanel(false)} title={editTemplate ? 'Modifica Template' : 'Nuovo Template'}>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Es: Pulizia Appartamento Standard" data-testid="template-name" />
          </div>
          <div className="space-y-2">
            <Label>Descrizione</Label>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className="resize-none" />
          </div>

          {/* Sections */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Sezioni</Label>
              <Button variant="outline" size="sm" onClick={addSection} className="h-7 text-xs gap-1"><Plus className="h-3 w-3" />Sezione</Button>
            </div>

            <div className="space-y-2">
              {form.sections.map((section, sIdx) => (
                <div key={sIdx} className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 cursor-pointer" onClick={() => setExpandedSection(expandedSection === sIdx ? null : sIdx)}>
                    <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                    <Input value={section.name} onChange={e => updateSection(sIdx, 'name', e.target.value)}
                      onClick={e => e.stopPropagation()} className="h-7 text-sm font-medium bg-transparent border-0 p-0 focus-visible:ring-0 flex-1" />
                    <span className="text-xs text-muted-foreground shrink-0">{(section.items || []).length} item</span>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); moveSection(sIdx, -1); }}><ChevronUp className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); moveSection(sIdx, 1); }}><ChevronDown className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={e => { e.stopPropagation(); removeSection(sIdx); }}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                    {expandedSection === sIdx ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>

                  {expandedSection === sIdx && (
                    <div className="p-3 space-y-2 bg-background">
                      {(section.items || []).map((item, iIdx) => {
                        const typeConf = ITEM_TYPE_CONFIG[item.item_type] || ITEM_TYPE_CONFIG.checkbox;
                        const TypeIcon = typeConf.icon;
                        return (
                          <div key={iIdx} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                            <TypeIcon className={cn("h-4 w-4 shrink-0", typeConf.color)} />
                            <Input value={item.label} onChange={e => updateItem(sIdx, iIdx, 'label', e.target.value)}
                              className="h-7 text-xs flex-1" placeholder="Nome item..." />
                            <Select value={item.item_type} onValueChange={v => updateItem(sIdx, iIdx, 'item_type', v)}>
                              <SelectTrigger className="h-7 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(ITEM_TYPE_CONFIG).map(([k, c]) => (
                                  <SelectItem key={k} value={k}><span className="text-xs">{c.label}</span></SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer shrink-0">
                              <input type="checkbox" checked={item.required} onChange={e => updateItem(sIdx, iIdx, 'required', e.target.checked)} className="rounded" />
                              Obb.
                            </label>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" onClick={() => removeItem(sIdx, iIdx)}><X className="h-3 w-3" /></Button>
                          </div>
                        );
                      })}
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(ITEM_TYPE_CONFIG).map(([k, c]) => {
                          const Icon = c.icon;
                          return (
                            <Button key={k} variant="outline" size="sm" onClick={() => addItem(sIdx, k)}
                              className="h-7 text-xs gap-1 px-2">
                              <Icon className={cn("h-3 w-3", c.color)} />{c.label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-3 flex-shrink-0">
          <Button variant="outline" onClick={() => setPanel(false)} className="flex-1">Annulla</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-template-btn">
            {saving ? '...' : editTemplate ? 'Aggiorna' : 'Crea template'}
          </Button>
        </div>
      </SidePanel>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={v => !v && setDeleteDialog({ open: false, id: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina template</AlertDialogTitle>
            <AlertDialogDescription>Sei sicuro? Il template verra eliminato permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChecklistTemplatesPage;
