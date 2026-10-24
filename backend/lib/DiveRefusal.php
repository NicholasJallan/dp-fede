<?php
declare(strict_types=1);

/** Refus d'une écriture de plongée (DiveService), traduit en réponse JSON par la route. */
final class DiveRefusal extends RuntimeException
{
    public function __construct(
        public readonly int $httpStatus,
        string $message,
        public readonly ?string $errorCode = null,
    ) {
        parent::__construct($message);
    }
}
