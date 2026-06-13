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
];
