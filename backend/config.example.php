<?php
// Copier vers /etc/dp-fede/config.php sur le Pi et remplir les valeurs
return [
    'db' => [
        'host' => '127.0.0.1',
        'name' => 'dp_fede',
        'user' => 'dp_fede_user',
        'pass' => 'CHANGEME',
    ],
    'google' => [
        // Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID
        // Type: Web application, Authorized JS origins: https://dp-fede.bullesenvalais.ch
        'client_id' => 'CHANGEME.apps.googleusercontent.com',
    ],
    'app' => [
        'domain' => 'dp-fede.bullesenvalais.ch',
    ],
    // Durées de conservation appliquées par bin/purge.php (cf. docs/rgpd.md).
    // Les options CLI (--soft-deleted-days=…, etc.) priment sur ces valeurs.
    'retention' => [
        'soft_deleted_days'       => 180, // lignes supprimées par l'utilisateur ; 0 = jamais purgées
        'archived_dives_years'    => 0,   // plongées archivées ; 0 = désactivé, sinon ≥ 1 (A322-72)
        'inactive_accounts_years' => 0,   // comptes inactifs ; 0 = désactivé, sinon ≥ 2
    ],
];
