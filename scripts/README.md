# Supabase SQL Migration Scripts

Ces scripts SQL configurent la base de données Supabase pour l'application Loterie PWA.

## Ordre d'exécution

Exécutez les scripts dans l'ordre suivant :

1. **001_create_tables.sql** - Crée les tables principales, indexes et triggers
2. **002_enable_rls.sql** - Active Row Level Security et définit les politiques d'accès
3. **003_seed_draw_schedules.sql** - Insère les 28 tirages de loterie
4. **004_create_realtime_publication.sql** - Configure Realtime pour les mises à jour en temps réel
5. **005_add_validation_constraints.sql** - Ajoute les contraintes de validation des données

## Comment exécuter

### Option 1 : Via l'interface Supabase

1. Allez sur https://supabase.com/dashboard
2. Sélectionnez votre projet
3. Allez dans "SQL Editor"
4. Copiez-collez chaque script dans l'ordre
5. Cliquez sur "Run" pour chaque script

### Option 2 : Via v0 (recommandé)

Les scripts peuvent être exécutés directement depuis v0 en utilisant le bouton "Run" dans l'interface.

## Structure des tables

### draw_schedules
Stocke les horaires des 28 tirages (4 par jour, 7 jours par semaine).

### draw_results
Stocke les résultats historiques avec :
- 5 numéros gagnants (winning_numbers)
- 5 numéros machine optionnels (machine_numbers)
- Date du tirage (draw_date)
- Nom du tirage (draw_name)

### admin_profiles
Stocke les profils des administrateurs pour l'authentification.

## Sécurité

- **RLS activé** sur toutes les tables
- **Lecture publique** pour draw_schedules et draw_results
- **Écriture authentifiée** pour draw_results (admin uniquement)
- **Accès restreint** pour admin_profiles (utilisateur propriétaire uniquement)

## Validation

Les contraintes garantissent :
- Exactement 5 numéros par tirage
- Numéros entre 1 et 90
- Dates de tirage valides (pas dans le futur)
- Format d'heure valide (HH:MM)
- Unicité (draw_date, draw_name)
