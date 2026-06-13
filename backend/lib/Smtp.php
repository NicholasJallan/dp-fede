<?php
declare(strict_types=1);

class Smtp {
    public static function send(string $to, string $subject, string $body): ?string {
        $cfg = Config::get('smtp');
        return self::transmit(
            $cfg['host'], $cfg['port'],
            $cfg['user'], $cfg['pass'],
            $cfg['from'], $to,
            $subject, $body
        );
    }

    private static function transmit(
        string $host, int $port,
        string $user, string $pass,
        string $from, string $to,
        string $subject, string $body
    ): ?string {
        $sock = @fsockopen($host, $port, $errno, $errstr, 10);
        if (!$sock) return "connect: {$errstr} ({$errno})";

        stream_set_timeout($sock, 10);

        $read = static function () use ($sock): string {
            $r = '';
            while ($line = fgets($sock, 512)) {
                $r .= $line;
                if (strlen($line) >= 4 && $line[3] === ' ') break;
            }
            return $r;
        };
        $cmd = static function (string $c) use ($sock, $read): string {
            fwrite($sock, $c . "\r\n");
            return $read();
        };
        $ok = static function (string $r, string $expect): ?string {
            return strncmp($r, $expect, strlen($expect)) === 0 ? null : "unexpected: {$r}";
        };

        $r = $read(); if ($e = $ok($r, '220')) return $e;
        $r = $cmd("EHLO localhost"); if ($e = $ok($r, '250')) return $e;
        $r = $cmd("STARTTLS"); if ($e = $ok($r, '220')) return $e;
        if (!stream_socket_enable_crypto($sock, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            fclose($sock); return "TLS handshake failed";
        }
        $r = $cmd("EHLO localhost"); if ($e = $ok($r, '250')) return $e;
        $r = $cmd("AUTH LOGIN"); if ($e = $ok($r, '334')) return $e;
        $r = $cmd(base64_encode($user)); if ($e = $ok($r, '334')) return $e;
        $r = $cmd(base64_encode($pass)); if ($e = $ok($r, '235')) return $e;
        $r = $cmd("MAIL FROM:<{$from}>"); if ($e = $ok($r, '250')) return $e;
        $r = $cmd("RCPT TO:<{$to}>"); if ($e = $ok($r, '250')) return $e;
        $r = $cmd("DATA"); if ($e = $ok($r, '354')) return $e;

        $headers = "Date: " . date('r') . "\r\n"
            . "From: DP Assistant <{$from}>\r\n"
            . "To: {$to}\r\n"
            . "Subject: {$subject}\r\n"
            . "Message-ID: <" . uniqid('', true) . "@dp-fede.bullesenvalais.ch>\r\n"
            . "MIME-Version: 1.0\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n";

        $safeBody = preg_replace('/^\./', '..', $body);
        fwrite($sock, $headers . "\r\n" . $safeBody . "\r\n.\r\n");

        $r = $read(); if ($e = $ok($r, '250')) return $e;
        $cmd("QUIT");
        fclose($sock);
        return null;
    }
}
