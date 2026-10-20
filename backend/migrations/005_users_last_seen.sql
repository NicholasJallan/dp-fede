-- Migration 005 — Dernière activité des comptes (RGPD : purge des inactifs).
--
-- Pourquoi : users.last_login n'est mis à jour qu'à la connexion Google.
-- Or la session glisse (sliding 7 j) : un DP actif peut ne jamais se
-- reconnecter pendant des mois. last_seen_at est rafraîchi par
-- Auth::current() au renouvellement de session (au plus 1 écriture / 3,5 j)
-- et à chaque connexion ; c'est lui que bin/purge.php utilise pour la purge
-- optionnelle des comptes inactifs.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at DATETIME NULL AFTER last_login;

UPDATE users
   SET last_seen_at = COALESCE(last_login, created_at)
 WHERE last_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users (last_seen_at);
