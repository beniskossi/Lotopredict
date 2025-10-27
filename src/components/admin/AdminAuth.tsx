"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAdmin } from "@/contexts/AdminContext"
import { useSupabase } from "@/contexts/SupabaseContext"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Shield, Lock, Eye, EyeOff, Mail, Info, Cloud, Key, AlertCircle, CheckCircle2 } from "lucide-react"

export function AdminAuth() {
  const [localPassword, setLocalPassword] = useState("")
  const [email, setEmail] = useState("")
  const [supabasePassword, setSupabasePassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"local" | "supabase">("local")
  const [loginAttempts, setLoginAttempts] = useState(0)
  const [isLocked, setIsLocked] = useState(false)

  const { setAdminPassword, isAuthenticated } = useAdmin()
  const { signIn, signUp, error: supabaseError, clearError, isConfigured, connectionStatus } = useSupabase()
  const { toast } = useToast()
  const router = useRouter()

  // Auto-select tab based on Supabase configuration
  useEffect(() => {
    if (!isConfigured) {
      setActiveTab("local")
    }
  }, [isConfigured])

  useEffect(() => {
    clearError()
  }, [activeTab, clearError])

  useEffect(() => {
    if (loginAttempts >= 5) {
      setIsLocked(true)
      toast({
        title: "Compte temporairement verrouillé",
        description: "Trop de tentatives échouées. Réessayez dans 5 minutes.",
        variant: "destructive",
      })

      const timeout = setTimeout(
        () => {
          setIsLocked(false)
          setLoginAttempts(0)
        },
        5 * 60 * 1000,
      ) // 5 minutes

      return () => clearTimeout(timeout)
    }
  }, [loginAttempts, toast])

  const handleLocalLogin = async () => {
    if (!localPassword.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer le mot de passe administrateur",
        variant: "destructive",
      })
      return
    }

    if (isLocked) {
      toast({
        title: "Compte verrouillé",
        description: "Trop de tentatives échouées. Veuillez réessayer plus tard.",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    // Call setAdminPassword which returns boolean result
    const success = setAdminPassword(localPassword)

    if (success) {
      setLoginAttempts(0)
      toast({
        title: "Connexion réussie",
        description: "Bienvenue dans l'interface administrateur",
      })
      // No need to redirect - the parent component will re-render
    } else {
      setLoginAttempts((prev) => prev + 1)
      toast({
        title: "Accès refusé",
        description: "Mot de passe administrateur incorrect",
        variant: "destructive",
      })
    }

    setIsLoading(false)
  }

  const handleSupabaseLogin = async () => {
    if (!email || !supabasePassword) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs",
        variant: "destructive",
      })
      return
    }

    if (isLocked) {
      toast({
        title: "Compte verrouillé",
        description: "Trop de tentatives échouées. Veuillez réessayer plus tard.",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      await signIn(email, supabasePassword)
      setLoginAttempts(0)
      toast({
        title: "Connexion réussie",
        description: "Accès à l'interface administrateur accordé",
      })
      // No need to redirect - the parent component will re-render
    } catch (error) {
      setLoginAttempts((prev) => prev + 1)
      console.error("Erreur connexion:", error)
      const errorMessage = error instanceof Error ? error.message : "Email ou mot de passe incorrect"
      toast({
        title: "Erreur de connexion",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSupabaseSignUp = async () => {
    if (!email || !supabasePassword) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs",
        variant: "destructive",
      })
      return
    }

    if (supabasePassword.length < 6) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 6 caractères",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      await signUp(email, supabasePassword)
      toast({
        title: "Inscription réussie",
        description: "Vérifiez votre email pour confirmer votre compte",
      })
    } catch (error) {
      console.error("Erreur inscription:", error)
      const errorMessage = error instanceof Error ? error.message : "Impossible de créer le compte"
      toast({
        title: "Erreur d'inscription",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-primary rounded-full flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Interface Administrateur</CardTitle>
          <p className="text-muted-foreground">Choisissez votre méthode d'authentification</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConfigured && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Supabase n'est pas configuré. Utilisez l'authentification locale pour accéder à l'interface
                administrateur.
              </AlertDescription>
            </Alert>
          )}

          {isConfigured && connectionStatus === "connected" && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">Supabase connecté et opérationnel</AlertDescription>
            </Alert>
          )}

          {supabaseError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{supabaseError}</AlertDescription>
            </Alert>
          )}

          {isLocked && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Compte temporairement verrouillé suite à plusieurs tentatives échouées. Réessayez dans quelques minutes.
              </AlertDescription>
            </Alert>
          )}

          {loginAttempts > 0 && loginAttempts < 5 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Tentative {loginAttempts}/5. Le compte sera verrouillé après 5 tentatives échouées.
              </AlertDescription>
            </Alert>
          )}

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "local" | "supabase")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="local" className="flex items-center space-x-2">
                <Key className="h-4 w-4" />
                <span>Mot de passe local</span>
              </TabsTrigger>
              <TabsTrigger value="supabase" className="flex items-center space-x-2" disabled={!isConfigured}>
                <Cloud className="h-4 w-4" />
                <span>Compte Supabase</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="local" className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Mot de passe administrateur local</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={localPassword}
                    onChange={(e) => setLocalPassword(e.target.value)}
                    placeholder="Entrez le mot de passe admin"
                    className="pl-10"
                    onKeyPress={(e) => e.key === "Enter" && handleLocalLogin()}
                    disabled={isLoading || isLocked}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLocked}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Button onClick={handleLocalLogin} className="w-full" disabled={isLoading || isLocked}>
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Vérification...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Se connecter
                  </>
                )}
              </Button>

              <div className="text-center pt-2">
                <p className="text-xs text-muted-foreground">
                  Mot de passe par défaut: <code className="bg-muted px-1 rounded">LotoBonheur2025!</code>
                </p>
              </div>
            </TabsContent>

            <TabsContent value="supabase" className="space-y-4 mt-4">
              {!isConfigured ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <p className="mb-2">Supabase n'est pas configuré. Pour l'activer:</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>Créez un projet sur supabase.com</li>
                      <li>Copiez .env.example vers .env.local</li>
                      <li>Ajoutez vos clés Supabase</li>
                      <li>Redémarrez l'application</li>
                    </ol>
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="votre@email.com"
                        className="pl-10"
                        disabled={isLoading || isLocked}
                        onKeyPress={(e) => e.key === "Enter" && handleSupabaseLogin()}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Mot de passe</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={supabasePassword}
                        onChange={(e) => setSupabasePassword(e.target.value)}
                        placeholder="••••••••"
                        className="pl-10"
                        disabled={isLoading || isLocked}
                        onKeyPress={(e) => e.key === "Enter" && handleSupabaseLogin()}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={isLocked}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Minimum 6 caractères</p>
                  </div>

                  <div className="space-y-2">
                    <Button onClick={handleSupabaseLogin} className="w-full" disabled={isLoading || isLocked}>
                      {isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          Connexion...
                        </>
                      ) : (
                        <>
                          <Cloud className="h-4 w-4 mr-2" />
                          Se connecter avec Supabase
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleSupabaseSignUp}
                      variant="outline"
                      className="w-full !bg-transparent !hover:bg-transparent bg-transparent"
                      disabled={isLoading || isLocked}
                    >
                      Créer un compte Supabase
                    </Button>
                  </div>

                  <div className="text-center pt-2">
                    <p className="text-xs text-muted-foreground">
                      Compte admin recommandé: <strong>beniskossi@gmail.com</strong>
                    </p>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
