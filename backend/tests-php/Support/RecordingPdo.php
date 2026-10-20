<?php
declare(strict_types=1);

namespace DpFede\Tests\Support;

use PDO;
use PDOStatement;
use ReflectionProperty;

/**
 * Faux PDO pour tester le SQL émis par les fonctions d'accès base sans
 * MariaDB : chaque requête (prepare/execute, query, exec) est journalisée
 * (SQL + paramètres) et reçoit des lignes scriptées (respond()). Les transactions sont réelles
 * (SQLite en mémoire) et journalisées comme 'BEGIN' / 'COMMIT' / 'ROLLBACK'.
 *
 *   $pdo = RecordingPdo::install();          // devient Db::get()
 *   $pdo->respond('/FROM dives/', [['id' => 'x']]);
 *   …
 *   RecordingPdo::uninstall();
 */
final class RecordingPdo extends PDO
{
    /** @var list<array{sql: string, params: array}> */
    public array $log = [];

    /** @var list<array{regex: string, rows: list<array>|\Closure, rowCount: int}> */
    private array $responders = [];

    public function __construct()
    {
        parent::__construct('sqlite::memory:');
        $this->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->setAttribute(PDO::ATTR_STATEMENT_CLASS, [RecordingStatement::class, [$this]]);
    }

    public static function install(): self
    {
        $pdo = new self();
        (new ReflectionProperty(\Db::class, 'pdo'))->setValue(null, $pdo);
        return $pdo;
    }

    public static function uninstall(): void
    {
        (new ReflectionProperty(\Db::class, 'pdo'))->setValue(null, null);
    }

    /**
     * Lignes renvoyées (et rowCount) pour les requêtes dont le SQL vérifie
     * $regex. Le premier répondeur correspondant gagne. $rows peut être une
     * fonction (sql, params) => list<array>.
     *
     * @param list<array>|\Closure $rows
     */
    public function respond(string $regex, $rows, int $rowCount = 0): void
    {
        $this->responders[] = ['regex' => $regex, 'rows' => $rows, 'rowCount' => $rowCount];
    }

    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        $st = parent::prepare('SELECT 1');
        if ($st instanceof RecordingStatement) $st->sql = $query;
        return $st;
    }

    /** exec() (DDL, migrations) : journalisé, jamais exécuté. */
    public function exec(string $statement): int|false
    {
        [, $count] = $this->record($statement, []);
        return $count;
    }

    /** query() : journalisée, lignes scriptées comme pour prepare()/execute(). */
    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false
    {
        $st = $this->prepare($query);
        $st->execute();
        return $st;
    }

    public function beginTransaction(): bool
    {
        $this->log[] = ['sql' => 'BEGIN', 'params' => []];
        return parent::beginTransaction();
    }

    public function commit(): bool
    {
        $this->log[] = ['sql' => 'COMMIT', 'params' => []];
        return parent::commit();
    }

    public function rollBack(): bool
    {
        $this->log[] = ['sql' => 'ROLLBACK', 'params' => []];
        return parent::rollBack();
    }

    /** @return array{0: list<array>, 1: int} */
    public function record(string $sql, array $params): array
    {
        $this->log[] = ['sql' => $sql, 'params' => $params];
        foreach ($this->responders as $r) {
            if (preg_match($r['regex'], $sql)) {
                $rows = $r['rows'] instanceof \Closure ? ($r['rows'])($sql, $params) : $r['rows'];
                return [$rows, $r['rowCount']];
            }
        }
        return [[], 0];
    }

    /** SQL journalisés (sans paramètres), espaces normalisés. */
    public function statements(): array
    {
        return array_map(static fn(array $e): string => (string)preg_replace('/\s+/', ' ', trim($e['sql'])), $this->log);
    }

    /** Premières entrées dont le SQL vérifie $regex. */
    public function matching(string $regex): array
    {
        return array_values(array_filter($this->log, static fn(array $e): bool => (bool)preg_match($regex, $e['sql'])));
    }
}

/** Instruction journalisée par RecordingPdo (n'exécute rien). */
final class RecordingStatement extends PDOStatement
{
    public string $sql = '';
    private RecordingPdo $owner;
    /** @var list<array> */
    private array $rows = [];
    private int $count = 0;

    protected function __construct(RecordingPdo $owner)
    {
        $this->owner = $owner;
    }

    public function execute(?array $params = null): bool
    {
        [$this->rows, $this->count] = $this->owner->record($this->sql, $params ?? []);
        return true;
    }

    public function fetch(int $mode = PDO::FETCH_DEFAULT, int $cursorOrientation = PDO::FETCH_ORI_NEXT, int $cursorOffset = 0): mixed
    {
        return array_shift($this->rows) ?? false;
    }

    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array
    {
        $rows = $this->rows;
        $this->rows = [];
        if ($mode === PDO::FETCH_COLUMN) {
            return array_map(static fn(array $r): mixed => reset($r), $rows);
        }
        return $rows;
    }

    public function fetchColumn(int $column = 0): mixed
    {
        $row = array_shift($this->rows);
        return $row === null ? false : (array_values($row)[$column] ?? false);
    }

    public function rowCount(): int
    {
        return $this->count;
    }
}
