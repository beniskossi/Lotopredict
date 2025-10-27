import {useState, useEffect} from 'react'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Alert, AlertDescription} from '@/components/ui/alert'
import {useAdmin} from '@/contexts/AdminContext'
import {DRAW_SCHEDULE} from '@/services/lotteryApi'
import {Save, AlertTriangle} from 'lucide-react'
import {useToast} from '@/hooks/use-toast'
import type {DrawResult} from '@/services/lotteryApi'

interface DrawResultModalProps {
  isOpen: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  initialData?: {result: DrawResult, index: number} | null
}

export function DrawResultModal({isOpen, onClose, mode, initialData}: DrawResultModalProps) {
  const {addDrawResult, updateDrawResult} = useAdmin()
  const {toast} = useToast()
  
  const [formData, setFormData] = useState<DrawResult>({
    draw_name: '',
    date: '',
    gagnants: [0, 0, 0, 0, 0],
    machine: undefined
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [includesMachine, setIncludesMachine] = useState(false)

  // Options pour les noms de tirages
  const drawNames = Array.from(new Set(
    Object.values(DRAW_SCHEDULE).flatMap(day => Object.values(day))
  )).sort()

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && initialData) {
        setFormData(initialData.result)
        setIncludesMachine(!!initialData.result.machine)
      } else {
        setFormData({
          draw_name: '',
          date: new Date().toISOString().split('T')[0],
          gagnants: [0, 0, 0, 0, 0],
          machine: undefined
        })
        setIncludesMachine(false)
      }
      setErrors({})
    }
  }, [isOpen, mode, initialData])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.draw_name.trim()) {
      newErrors.draw_name = 'Le nom du tirage est requis'
    }

    if (!formData.date) {
      newErrors.date = 'La date est requise'
    }

    // Validation des numéros gagnants
    const gagnants = formData.gagnants.filter(n => n > 0)
    if (gagnants.length !== 5) {
      newErrors.gagnants = 'Exactement 5 numéros gagnants sont requis'
    } else {
      const invalidNumbers = gagnants.filter(n => n < 1 || n > 90)
      if (invalidNumbers.length > 0) {
        newErrors.gagnants = 'Les numéros doivent être entre 1 et 90'
      }
      
      const duplicates = gagnants.length !== new Set(gagnants).size
      if (duplicates) {
        newErrors.gagnants = 'Les numéros ne peuvent pas être dupliqués'
      }
    }

    // Validation des numéros machine (si inclus)
    if (includesMachine && formData.machine) {
      const machine = formData.machine.filter(n => n > 0)
      if (machine.length !== 5) {
        newErrors.machine = 'Exactement 5 numéros machine sont requis'
      } else {
        const invalidNumbers = machine.filter(n => n < 1 || n > 90)
        if (invalidNumbers.length > 0) {
          newErrors.machine = 'Les numéros machine doivent être entre 1 et 90'
        }
        
        const duplicates = machine.length !== new Set(machine).size
        if (duplicates) {
          newErrors.machine = 'Les numéros machine ne peuvent pas être dupliqués'
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validateForm()) {
      toast({
        title: '❌ Erreur de validation',
        description: 'Veuillez corriger les erreurs avant de continuer',
        variant: 'destructive'
      })
      return
    }

    const result: DrawResult = {
      ...formData,
      gagnants: formData.gagnants.sort((a, b) => a - b),
      machine: includesMachine && formData.machine ? 
        formData.machine.sort((a, b) => a - b) : undefined
    }

    if (mode === 'create') {
      addDrawResult(result)
      toast({
        title: '✅ Tirage ajouté',
        description: `${result.draw_name} du ${result.date} a été ajouté avec succès`
      })
    } else if (mode === 'edit' && initialData) {
      updateDrawResult(initialData.index, result)
      toast({
        title: '✅ Tirage modifié',
        description: `${result.draw_name} du ${result.date} a été modifié avec succès`
      })
    }

    onClose()
  }

  const updateGagnant = (index: number, value: string) => {
    const num = parseInt(value) || 0
    const newGagnants = [...formData.gagnants]
    newGagnants[index] = num
    setFormData({...formData, gagnants: newGagnants})
  }

  const updateMachine = (index: number, value: string) => {
    const num = parseInt(value) || 0
    const newMachine = formData.machine ? [...formData.machine] : [0, 0, 0, 0, 0]
    newMachine[index] = num
    setFormData({...formData, machine: newMachine})
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Nouveau Tirage' : 'Modifier le Tirage'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informations de base */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="draw_name">Nom du tirage</Label>
              <Select 
                value={formData.draw_name} 
                onValueChange={(value) => setFormData({...formData, draw_name: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un tirage" />
                </SelectTrigger>
                <SelectContent>
                  {drawNames.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.draw_name && (
                <p className="text-sm text-red-600">{errors.draw_name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
              />
              {errors.date && (
                <p className="text-sm text-red-600">{errors.date}</p>
              )}
            </div>
          </div>

          {/* Numéros gagnants */}
          <div className="space-y-2">
            <Label>Numéros gagnants</Label>
            <div className="grid grid-cols-5 gap-2">
              {formData.gagnants.map((num, index) => (
                <Input
                  key={index}
                  type="number"
                  min="1"
                  max="90"
                  value={num || ''}
                  onChange={(e) => updateGagnant(index, e.target.value)}
                  placeholder={`N°${index + 1}`}
                />
              ))}
            </div>
            {errors.gagnants && (
              <p className="text-sm text-red-600">{errors.gagnants}</p>
            )}
          </div>

          {/* Numéros machine */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="include_machine"
                checked={includesMachine}
                onChange={(e) => {
                  setIncludesMachine(e.target.checked)
                  if (!e.target.checked) {
                    setFormData({...formData, machine: undefined})
                  } else {
                    setFormData({...formData, machine: [0, 0, 0, 0, 0]})
                  }
                }}
              />
              <Label htmlFor="include_machine">Inclure les numéros machine</Label>
            </div>
            
            {includesMachine && (
              <>
                <div className="grid grid-cols-5 gap-2">
                  {(formData.machine || [0, 0, 0, 0, 0]).map((num, index) => (
                    <Input
                      key={index}
                      type="number"
                      min="1"
                      max="90"
                      value={num || ''}
                      onChange={(e) => updateMachine(index, e.target.value)}
                      placeholder={`M${index + 1}`}
                    />
                  ))}
                </div>
                {errors.machine && (
                  <p className="text-sm text-red-600">{errors.machine}</p>
                )}
              </>
            )}
          </div>

          {/* Avertissements */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Vérifiez bien les numéros avant de sauvegarder. Les modifications seront enregistrées dans le journal d'audit.
            </AlertDescription>
          </Alert>

          {/* Actions */}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={handleSubmit}>
              <Save className="h-4 w-4 mr-2" />
              {mode === 'create' ? 'Créer' : 'Modifier'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
