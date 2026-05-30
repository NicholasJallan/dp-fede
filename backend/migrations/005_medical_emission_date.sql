-- Conversion dates médicales : expiration → émission
-- Les dates saisies jusqu'ici étaient des dates d'expiration.
-- On soustrait 1 an pour obtenir la date d'émission réelle.
UPDATE divers SET medical = DATE_SUB(medical, INTERVAL 1 YEAR) WHERE medical IS NOT NULL;
