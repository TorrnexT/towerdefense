# Emberwatch

Fantasy-Tower-Defense mit Three.js und React: **15 Kampagnenmissionen**, fünf 3D-Karten, zehn Türme, drei Gegner und Endless. Solo wird vollständig im Browser simuliert; Koop mit bis zu vier Spielern läuft auf dem Colyseus-Server. Beide verwenden denselben Spielkern.

## Start

Node.js 22+, pnpm 12.3.4 und ein aktueller Browser mit WebGL 2, Web Crypto, IndexedDB und Web Locks werden benötigt.

```sh
corepack enable
pnpm install
pnpm run dev
```

Spiel: http://localhost:5173 · Koop-Server/Healthcheck: http://localhost:2567/health. Client, Modelle, Bilder und Fonts werden lokal ausgeliefert. `pnpm run dev` startet Client und Server gemeinsam. Solo benötigt keine Serververbindung; in der Entwicklung liefert Vite die Dateien aus.

```sh
pnpm run build
pnpm start
```

Der Produktionsserver liefert `gameclient/dist` unter http://localhost:2567 aus. `PORT` überschreibt den Port. Bei separatem Hosting vor dem Build `VITE_SERVER_URL=https://gameserver.example` setzen. HTTPS-Proxys müssen WebSocket-Upgrades unterstützen. Öffentliches Hosting wird nicht eingerichtet.

Client und Server können auch einzeln mit `pnpm --filter @emberwatch/gameclient dev` beziehungsweise `pnpm --filter @emberwatch/server dev` gestartet werden. Die drei Pakete werden über `pnpm-workspace.yaml` verbunden; `pnpm-lock.yaml` hält die Abhängigkeiten fest. In CI: `pnpm install --frozen-lockfile`.

Für den Server-Manager liegen vollständige Build-Workflows in `server/.monitoring/build.yaml` und `gameclient/.monitoring/build.yaml`. Beide verwenden Ubuntu 24.04, Node.js 24 und pnpm 12.3.4 und können vom Manager als aufeinanderfolgende Jobs in einem Runner-Aufruf ausgeführt werden. Die `run`-Pfade beziehen sich jeweils auf den Paketordner; der Manager stellt den Checkout bereit.

- Prozessquelle: `server`; Startdatei: `dist/index.js`. Der Server-Workflow erzeugt ein portables Artefakt mit `server/dist`, `server/package.json` und Produktionsabhängigkeiten. Die Workspace-Abhängigkeiten müssen auf dem Zielserver nicht installiert werden.
- Ressourcenquelle: `gameclient`; Build-Ausgabe: `dist`. Der Gameclient-Workflow erzeugt auch das Offline-Paket; der Manager übernimmt die Ausgabe als Ressourcen-Artefakt.

Die Anwendungskonfiguration wird ebenfalls aus YAML übernommen:

- `server/.monitoring/processes.yaml`: Node.js-Prozess `emberwatch-server`, Rolle `web`, Start mit `node dist/index.js`, `NODE_ENV=production` und Port 2567.
- `gameclient/.monitoring/resources.yaml`: Ressource `gameclient` aus `gameclient/dist`, einschließlich Offline-Paket.
- `.monitoring/vhosts.yaml`: Ein gemeinsamer VHost für die statischen Spieldateien und den Spielserver unter `/api/`, einschließlich WebSocket-Upgrades. Der Client-Workflow setzt dafür `VITE_SERVER_URL=/api`. Matchmaking, Koop und Healthcheck laufen dadurch über dieselbe Domain; der Healthcheck liegt unter `/api/health`.

Die Domain wird je Installation im Manager eingetragen; die Server-Rolle muss `web` enthalten. Nginx oder Apache muss als benötigter Service konfiguriert sein. TLS ist zunächst deaktiviert, da noch keine Domain-/Zertifikatsdaten festgelegt sind. Für öffentliches Hosting mit Offline-Funktion und verschlüsseltem Spielstand HTTPS am vorgeschalteten Proxy oder mit passender TLS-Konfiguration in `vhosts.yaml` einrichten. Die lokalen Entwicklungs- und Standard-Build-Befehle behalten ihre bisherigen Endpunkte.

Nach dem Commit und Push im Manager das Repository-Menü **… → Monitoring Config aktualisieren** verwenden. Alternativ aktualisiert **Builds → Build-Script → Build-Skripte aktualisieren** alle Repositories. Die Repository-Builds sind standardmäßig aktiv; importierte Prozesse, Ressourcen und VHosts werden anschließend über ihre YAML-Dateien gepflegt.

Falls `emberwatch-server` oder der Ressourcen-Key `gameclient` bereits manuell angelegt wurden, müssen diese Einträge vor der Übernahme im Manager bereinigt werden: Der Import überschreibt vorhandene manuelle Einträge nicht. Vorher vorhandene VHost-/Build-Zuordnungen prüfen. Manuelle Build-Jobs für dieselben Ziele entfernen, um doppelte Artefakt-Zuordnungen zu vermeiden.


## Spielablauf

**Einzelspieler** und **Multispieler** führen jeweils zu **Kampagne** oder **Endless**. Vor einem neuen Durchlauf wird das Turmteam bestätigt. Im Koop erstellt der Host eine private Lobby; andere Spieler treten per Code oder Einladungslink bei. Der Host wählt die gemeinsame Karte beziehungsweise Mission. Jeder bearbeitet sein eigenes Team und bestätigt seine Bereitschaft, dann startet der Host.

**Spiel fortsetzen** führt zum noch laufenden Durchlauf zurück. Das Hauptmenü pausiert einen laufenden Kampf nicht. Lokales Solo pausiert, wenn der Browser-Tab in den Hintergrund wechselt. Ein Reload oder Schließen verwirft den lokalen Kampf; Fortschritt, Rekorde und Team bleiben gespeichert. Koop unterstützt Wiederverbindung mit gleicher Identität und gleichem Zustand für 60 echte Sekunden.

### Kampagne

| Kapitel       | Missionen                                         | Wellen       |
| ------------- | ------------------------------------------------- | ------------ |
| Waldtal       | Erste Wacht · Am alten Tor · Belagerung im Tal    | 4 / 5 / 6    |
| Silberfurt    | An den Ufern · Zwei Brücken · Stromwacht          | 6 / 7 / 8    |
| Bernsteinhain | Goldene Pfade · Die alten Ruinen · Zangenangriff  | 8 / 9 / 10   |
| Frostklamm    | Schneewacht · Eisige Gabelung · Halt in der Klamm | 10 / 11 / 12 |
| Glutspalten   | Ascheregen · Drei Feuerwege · Die letzte Bastion  | 12 / 13 / 14 |

Die letzte Welle endet erst, wenn alle Gegner und Geschosse aufgelöst sind. Bei verbleibendem Festungsleben folgt der Sieg. Ein Erstsieg schaltet die nächste Mission frei. Jeder Missionssieg, auch eine Wiederholung, gibt 100 EP und 50 Forschungspunkte. Im Endless gibt es dieselbe Belohnung nach jeder vollständig überstandenen zehnten Welle (10, 20, 30 usw.), erneut in jedem neuen Durchlauf. Starten der Welle allein genügt nicht. Jede Belohnung besitzt eine eindeutige Durchlauf-/Wellenkennung und wird auch bei Wiederverbindung oder mehreren Tabs nur einmal gutgeschrieben. Gewonnene Missionen bleiben wiederholbar. Gegnerleben steigen zusätzlich um 5 %, Basisschaden um 3 % je Missionsnummer nach der ersten. Startgold bleibt 240; Koop-Skalierung kommt hinzu.

| Spielstand-Level | EP   | Turmslots |
| ---------------- | ---- | --------- |
| 1                | 0    | 3         |
| 2                | 100  | 4         |
| 3                | 300  | 5         |
| 4                | 500  | 6         |
| 5                | 700  | 7         |
| 6                | 900  | 8         |
| 7                | 1100 | 9         |
| 8                | 1300 | 10        |

Die EP beider Modi erhöhen dasselbe lokale Spielstand-Level. Nach Level 8 steigt es alle 200 EP weiter; die Zahl der Slots bleibt auf zehn begrenzt.

Die illustrierte Kampagnenkarte hat 15 Missionspunkte. Maus: ziehen und Mausrad. Touch: ein Finger verschiebt, zwei Finger zoomen. Zoom- und Zentrieren-Buttons sowie per Tastatur erreichbare Missionspunkte ergänzen die Gesten. Details liegen am Desktop seitlich und auf kleinen Displays unten. Kampagnenbilder enthalten keine eingebrannten Texte oder Bedienelemente.

### Turmteam und Kampf

Alle 13 Turmtypen sind sofort im Katalog verfügbar. Die Slots begrenzen unterschiedliche mitgenommene Typen, nicht gebaute Türme; insgesamt bleiben 60 Bauten erlaubt. Jeder Typ darf einmal im Team vorkommen, mindestens einer muss gewählt werden. Das erste Standardteam besteht aus Balliste, Arkanobelisk und Feuerturm.

- Oben zehn Slots, unten der Katalog. Karten auf Slots ziehen, belegte Teamplätze tauschen oder einen Slot mit dem Entfernen-Button leeren. Auf Touch aktiviert langes Drücken den Team-Drag; kurze Wischbewegungen scrollen. Alternativ Turm und Slot antippen oder mit Tab/Enter wählen.
- Die bestätigte Reihenfolge wird gespeichert und im horizontal scrollbaren Spiel-Dock übernommen. `TowerCard` ist dieselbe React-Komponente in Katalog, Slots und Dock.
- Im Kampf eine Karte auf die freie Map ziehen und loslassen. Touch: nach oben ziehen oder kurz halten und ziehen; horizontales Wischen scrollt das Dock. Die Vorschau zeigt Reichweite und ungültige Bauflächen. Escape, zweiter Finger und Gestenabbruch verwerfen den Bau.
- Mit der Maus über einen gebauten Turm fahren zeigt dessen Reichweite und hebt ihn leicht hervor. Ein Klick oder Antippen hält die Auswahl mit goldener Bodenmarkierung und Reichweitenkreis fest. Andere Türme lassen sich weiterhin per Hover vergleichen. Die Anzeige berücksichtigt Gold-Upgrades und Forschung; auf Smartphones bleiben die Details kompakt und scrollbar.
- Die erste Welle wird manuell gestartet. Danach 15 Sekunden Baupause mit „Jetzt starten“. Der Tempobutton schaltet 1× / 2× / 5× / 10×; feste Kollisionsschritte bleiben unverändert.
- Türme bis Stufe 5 aufwerten oder für 70 % der Investition verkaufen. Nur Abschüsse geben Gold. Gegner am Wegende beschädigen einmalig die Festung und verschwinden; sie greifen keine Türme an.
- Balliste, Scharfschützenturm und Repetierturm feuern physische Bolzen. Arkanobelisk und Prismenlanze verschießen arkane Zielgeschosse. Feuerturm verursacht Feuer-Flächenschaden, Glutspucker schnelle Feuer-Einzeltreffer. Granatwerfer, Runenmörser und Meteorturm schießen physische, arkane beziehungsweise feurige Flächengeschosse im Bogen.
- Koboldläufer sind schnell, Eisenoger physisch gepanzert, Runengeister arkanresistent. Türme und Gegner antippen zeigt Werte. Der Lautsprecher aktiviert synthetisierte Kampfgeräusche.
- Schlachtfeld-Kamera: rechts ziehen und Mausrad; auf Touch zwei Finger zum Verschieben/Zoomen. Die Oberfläche unterstützt Hoch-/Querformat, Tablets, Desktop und reduzierte Bewegung.

### Schaden über Zeit und Kontrolle

Drei weitere Türme ergänzen die Sammlung; maximal zehn unterschiedliche Typen können weiterhin mitgenommen werden. Alle unterstützen fünf Gold-Stufen und 15 Forschungsschritte.

| Turm         | Preis | Direktschaden | Angriffe/s | Reichweite | Zusatzeffekt auf Stufe 1              |
| ------------ | ----- | ------------- | ---------- | ---------- | ------------------------------------- |
| Brandbake    | 175   | 12 Feuer      | 0,7        | 4,8        | 12 Feuerschaden/s für 4 s, Einzelziel |
| Giftkessel   | 200   | 8 Gift        | 0,5        | 5,4        | 8 Giftschaden/s für 6 s, Radius 1,5   |
| Frostobelisk | 155   | 10 Arkan      | 0,8        | 4,6        | 35 % langsamer für 2,5 s, Radius 1,1  |

Effekte beginnen erst beim Einschlag. Brand und Gift wirken parallel. Pro Typ wirkt höchstens eine Dosis: Gleich starke Treffer erneuern die Dauer, stärkere ersetzen den Effekt; schwächere verlängern eine stärkere Dosis nicht. Derselbe Grundsatz gilt für Frost. Verlangsamung addiert sich nicht; die maximale Stärke ist 60 %. Nach Ablauf kehrt das ursprüngliche Tempo zurück. Der Geschossvorhalt berücksichtigt verlangsamte Ziele.

Gift verwendet einen eigenen Schadenstyp mit derselben Verteidigungsformel: Kobolde haben 0, Oger 15 und Runengeister 50 Giftverteidigung. Schaden über Zeit wird in den festen 50-ms-Schritten einschließlich anteiligem letzten Schritt berechnet. Abschüsse geben genau einmal Gold und können eine Mission beenden. Verkauf oder Aufwertung eines Turms ändern bereits gestartete Effekte nicht. Pausen stoppen Timer; tote oder durchgelassene Gegner, Niederlage und Neustart räumen Effekte auf. Koop-Rechte und Goldverteilung gelten wie bei direkten Treffern.

Gold-Upgrades und Schadensforschung verstärken Brand-/Gift-DPS. Frost gewinnt je Gold-Stufe 4 Prozentpunkte Stärke und 0,2 s Dauer; je Forschungszacke 0,3 Prozentpunkte Stärke. Forschungsgewinne je Zacke für Schaden/Tempo/Reichweite/Radius: Brandbake 4/0,5/0,3/0 %, Giftkessel 4/0,5/0,3/0,8 %, Frostobelisk 3/0,8/0,4/0,8 %. Die Werkstatt zeigt die zusätzlichen Werte. Orange, grüne und blaue Markierungen über Gegnern zeigen Brand, Gift und Frost; die Gegnerauswahl nennt verbleibende Dauer und effektives Tempo.

### Permanente Turmforschung

Der dritte Hauptmenüpunkt „Türme“ öffnet die Sammlung. In der Teamplanung öffnet „Erforschen“ unter jeder Karte dieselbe Werkstatt, ohne die noch unbestätigte Aufstellung zu verwerfen. Alle 13 Türme sind freigeschaltet. Die gemeinsame Kartenkomponente unterstützt außerdem einen grauen, nicht verfügbaren Zustand für spätere gesperrte Typen.

Jeder Turm beginnt mit einem leeren grauen Stern. Eine Forschung füllt eine von fünf Zacken. Bei fünf Zacken wird der Stern vollständig golden; Schritt sechs beginnt den zweiten, Schritt elf den dritten Stern. Bei 15 Forschungen ist Schluss. Sterne erscheinen oben rechts auf Karten im Katalog, in Slots, in der Sammlung und im Spiel-Dock.

Kosten: `25 + 10 × bisherige Forschungsstufe` FP (25 bis 165 FP), insgesamt 1425 FP pro vollständig erforschtem Turm. Die Werkstatt zeigt Punkte, Kosten und tatsächliche Werte vor/nach dem nächsten Schritt. Erforschter Schaden wird auf zwei Nachkommastellen gerundet, damit auch kleine Ausbauschritte wirksam bleiben. Additive Steigerungen beziehen sich auf die ursprünglichen Grundwerte, anschließend gelten die bestehenden Gold-Upgrades im Kampf. Kaufpreise und Gold-Upgrade-Kosten ändern sich nicht.

| Turm               | Schaden / Schritt | Tempo / Schritt | Reichweite / Schritt | Flächenradius / Schritt |
| ------------------ | ----------------- | --------------- | -------------------- | ----------------------- |
| Balliste           | 4 %               | 0,8 %           | 0,3 %                | –                       |
| Arkanobelisk       | 5 %               | 0,5 %           | 0,3 %                | –                       |
| Feuerturm          | 3,5 %             | 0,6 %           | 0,2 %                | 0,8 %                   |
| Granatwerfer       | 4 %               | 0,5 %           | 0,3 %                | 1 %                     |
| Scharfschützenturm | 5,5 %             | 0,4 %           | 0,4 %                | –                       |
| Repetierturm       | 3 %               | 1,2 %           | 0,2 %                | –                       |
| Runenmörser        | 4 %               | 0,5 %           | 0,3 %                | 0,8 %                   |
| Prismenlanze       | 5,5 %             | 0,4 %           | 0,4 %                | –                       |
| Glutspucker        | 3,5 %             | 1 %             | 0,3 %                | –                       |
| Meteorturm         | 5 %               | 0,3 %           | 0,2 %                | 1 %                     |

Forschung gilt ab dem nächsten Durchlauf, einschließlich Solo-Worker und Koop. In der Koop-Lobby werden Änderungen übernommen und die eigene Bereitschaft zurückgesetzt. Im Kampf bleiben Forschung und Team unveränderlich. Gebaute Türme behalten ihren Forschungsstand bei einem Besitzerwechsel. Simulation und Server prüfen bekannte Typen, ganzzahlige Stufen 0–15, EP, Slotgrenzen und die Finanzierbarkeit der Forschung. Die Werte stehen zentral in `shared/src/research.ts`.

### Karten und Koop

Alle fünf Karten sind im Endless sofort verfügbar. Die Kampagne schaltet ihre Missionen nacheinander frei. Waldtal hat eine Route, Silberfurt eine Gabelung mit Flussbrücken, Bernsteinhain zwei Eingänge, Frostklamm drei Routen durch Felspassagen und Glutspalten drei Wege über Lava. Wasser, Lava, Wege, Brücken, Hindernisse, andere Türme und der Kartenrand sind nicht bebaubar. Gewässer haben keine zusätzlichen Schadens- oder Bewegungseffekte.

Gegner werden pro Welle reihum auf vollständige Routen verteilt; ihre Gesamtzahl bleibt unverändert. Türme wählen innerhalb der Reichweite den Gegner mit der kürzesten verbleibenden Strecke zur Festung. Ein laufender Durchlauf behält Karte, Mission und Teams. Eine neue Lobby erlaubt erneute Auswahl.

Im Koop muss die gewählte Mission für alle Mitglieder freigeschaltet sein. Eine Missions-/Kartenänderung setzt alle Bereitschaftsbestätigungen zurück; eine Teamänderung nur die eigene. Start, Tempo und Wellen kontrolliert der Host. Jeder besitzt einen eigenen Geldbeutel und eigene Türme. Die beim Start festgelegte Gruppengröße skaliert Gegnerleben um 85 % und Basisschaden um 20 % pro weiterem Spieler. Goldbelohnungen werden mit der Gruppengröße multipliziert und unter verbliebenen Mitgliedern einschließlich reservierter Spieler verteilt.

Abbrüche reservieren einen Platz 60 Sekunden; solange jemand verbunden ist, läuft Koop weiter. Host-Ausfall übergibt die Kontrolle. Alle getrennt: Pause. Dauerhafte Abgänge übertragen Gold und Türme an den verbleibenden Host. Siege werden auch reservierten Mitgliedern gutgeschrieben. Die Raumzustände bewahren diese Auszeichnungen über eine neue Lobby hinweg, damit eine rechtzeitige Wiederverbindung den lokalen Sieg noch speichern kann. Neue Beitritte sind während des Kampfes gesperrt. Räume und Kämpfe liegen ausschließlich im Arbeitsspeicher.

## Verschlüsselter Spielstand

`gameclient/src/profile.ts` speichert gewonnene Missionen, Missionsrekorde, Endless-Bestwerte pro Karte und die bestätigte Turmauswahl. Außerdem werden EP, bereits gutgeschriebene Belohnungskennungen und Forschungsstufen verschlüsselt gespeichert. Level und Slots werden aus EP abgeleitet; verfügbare Forschungspunkte ergeben sich aus den Belohnungen abzüglich aller Forschungskosten. Solo und Koop teilen sich den lokalen Fortschritt. Es gibt keine gespeicherten Zwischenstände eines Kampfes.

- AES-256-GCM mit zufälligem 96-Bit-IV pro Speicherung und versioniertem Format. Ciphertext: `localStorage['emberwatch-profile-v1']`. Die letzte gültige Fassung bleibt unter `…-backup`.
- Ein nicht exportierbarer `CryptoKey` liegt separat in IndexedDB `emberwatch-vault`, Store `keys`. Kein Passwort und keine Serverabfrage.
- Web Locks serialisieren Zugriffe auch zwischen Tabs. Jede Änderung liest den aktuellen verschlüsselten Stand; Erstsiege und Rekorde werden zusammengeführt. Dieselbe Belohnungskennung erzeugt keine doppelten EP. Forschungskäufe prüfen unter derselben Sperre den aktuellen Rang und das verfügbare Budget; konkurrierende Klicks können Punkte nicht doppelt ausgeben.
- Beschädigung, fehlender Schlüssel oder Speicherfehler werden sichtbar gemeldet und blockieren weiteres Speichern. „Erneut versuchen“ kann ausstehende Änderungen nach Behebung erneut schreiben; „Sicherung wiederherstellen“ stellt die gültige lokale Sicherung wieder her. Fehlerhafte Daten werden nicht still ersetzt.
- Ältere verschlüsselte Kampagnenspielstände behalten ihre bisherigen EP (100 pro Erstsieg) und erhalten rückwirkend 50 FP pro Erstsieg. Alle Forschungsstufen starten bei null. Alte Endlos-Bestwerte bleiben erhalten, vergeben rückwirkend aber keine Belohnungen, da ihre Durchläufe nicht gespeichert wurden.
- Alte `emberwatch-best`-/`emberwatch-best-<mapId>`-Werte werden einmalig importiert und erst nach erfolgreichem verschlüsseltem Rundlauf entfernt.

Website-Daten löschen entfernt auch Schlüssel und Spielstand. Es gibt keine Accounts oder Cloud-Synchronisierung. Verschlüsselung dient **nicht als Anti-Cheat-System**: Der Koop-Server prüft die Struktur des übermittelten lokalen Fortschritts, kann Offline-Erfolge ohne Account aber nicht unabhängig beweisen. Technischer Hintergrund: [Web Crypto / CryptoKey in IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto).

## Offline-Web-App und Handytests

Der Produktionsbuild enthält Manifest, Icons und einen versionierten Service Worker. Spielcode, Simulations-Worker, Fonts, Modelle und sämtliche Kampagnenbilder werden vollständig vorab zwischengespeichert. Erst danach erscheint **„Offline bereit“**. Anschließend lässt sich die App ohne Netz erneut öffnen und Solo spielen. Koop zeigt offline einen Verbindungszustand und bleibt online erforderlich.

Updates warten auf Aktivierung. Der Updatebutton erscheint nur außerhalb eines laufenden Durchlaufs; ein Kampf wird nicht automatisch durch ein Update neu geladen. Fehlgeschlagene Cache-Installationen aktivieren keine unvollständige Version. Entwicklungsbetrieb verwendet keinen Service Worker.

**HTTPS oder localhost ist erforderlich.** Eine unverschlüsselte WLAN-IP reicht für Web Crypto und Service Worker nicht. Siehe [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).

Für vertrauenswürdige Handytests im WLAN beispielsweise einen eigenen HTTPS-Reverse-Proxy verwenden:

1. Mit `mkcert` eine lokale Entwicklungs-CA installieren und ein Zertifikat für die LAN-IP des Computers erzeugen. Nur das öffentliche CA-Zertifikat (`rootCA.pem`) aufs eigene Testgerät übertragen und dort ausdrücklich als vertrauenswürdig installieren. Den privaten CA-Schlüssel niemals übertragen.
2. `pnpm run build` und `pnpm start` ausführen. Beispielsweise Caddy auf Port 8443 mit dieser Konfiguration starten (IP und Zertifikatspfade anpassen):

   ```text
   https://192.168.178.30:8443 {
     tls /absolute/path/lan.pem /absolute/path/lan-key.pem
     reverse_proxy 127.0.0.1:2567
   }
   ```

3. Computer und Handy ins gleiche WLAN, Firewall für 8443 freigeben. `https://192.168.178.30:8443` öffnen; es darf keine Zertifikatswarnung geben. Für Einladungen auch der Host über diese Adresse spielen. `localhost` bezeichnet auf jedem Gerät das Gerät selbst.
4. Auf „Offline bereit“ warten, ggf. zum Home-Bildschirm hinzufügen, Netz deaktivieren, App neu öffnen, eine Mission abschließen und nach erneutem Öffnen den Fortschritt prüfen.

Zertifikatsinstallation ist eine lokale Testvorbereitung und wurde nicht automatisch am Gerät vorgenommen. Öffentliches Hosting ist nicht Teil des Projekts.

## Architektur

```text
gameclient/src/session.ts           Einheitlicher Solo-/Koop-Sitzungsadapter
gameclient/src/simulation.worker.ts Browser-Simulation bei 20 festen Schritten/s
gameclient/src/profile.ts           Verschlüsselung, Migration, Sicherung, Tab-Zusammenführung
gameclient/src/CampaignMap.tsx      Bildkarte mit relativen Missionspunkten und Zoom/Pan
gameclient/src/TeamPicker.tsx       Teamverwaltung für Maus, Touch und Tastatur
gameclient/src/TowerCard.tsx        Gemeinsame Turmkarte
gameclient/src/world.ts             3D-Modelle, Interpolation und Effekte
shared/src/simulation.ts            Gemeinsame Kämpfe, Wellen, Missionen, Befehlsvalidierung
shared/src/campaign.ts              15 Missionen, EP-Grenzen, Slots und Teamvalidierung
shared/src/research.ts              Belohnungen, Forschungskosten und Steigerung je Turm
shared/src/index.ts                 13 Türme, Gegner, Projektile und Balance
shared/src/maps.ts                  Karten, Routen, Brücken und Bauprüfung
shared/src/schema.ts                Synchronisierter Zustand einschließlich Teams/Auszeichnungen
server/src/room.ts                  Colyseus-Lobby, Mitglieder und Wiederverbindung
scripts/build-offline.mjs           Produktionscache mit inhaltsbasierter Version
scripts/campaign-art.json           Generierungsquellen und vollständige Bildprompts
```

Es gibt nur eine Kampfsimulation. Lokaler Worker und Server importieren `shared/src/simulation.ts`; der Server-Importpfad ist ein Re-Export. Bewegte Kugelkollisionen prüfen Flugsegmente zwischen festen 50-ms-Schritten, einschließlich gegnerischer Bewegung. Schaden entsteht erst am Einschlag. Projektile behalten Schaden und Besitzer vom Abschuss, auch nach Aufwertung/Verkauf. Zielverlust erzeugt keinen automatischen Treffer; Granaten detonieren auch am Boden. Schaden: `Grundschaden × 100 / (100 + Verteidigung)`.

Befehle haben eindeutige IDs. Wiederholungen erhalten dieselbe Quittung; Platzierung, Preis, Phase, Team, Slots, Besitz und Freigaben werden im Spielkern geprüft. Colyseus überträgt Zustandsänderungen alle 50 ms. Solo liefert dasselbe Zustand-/Schuss-/Einschlagsformat per Worker. Die UI interpoliert und erzeugt visuelle Effekte.

## Prüfung

```sh
pnpm run typecheck
pnpm test
pnpm run test:integration
pnpm run verify:balance
pnpm run verify:balance --coop
pnpm run build
# Laufendes pnpm run dev und installiertes Google Chrome:
pnpm run verify:campaign
pnpm run verify:storage
pnpm run verify:research
pnpm run verify:status
pnpm run verify:hover
pnpm run verify:browser
pnpm run verify:coop
pnpm run verify:menu
pnpm run verify:maps
# Separater Testserver für den Produktionsbuild auf Port 2570:
pnpm run verify:production
pnpm run format:check
```

Tests prüfen Kampagne/Endless, einmalige Siege, Fortschritts- und Slotgrenzen, sämtliche Turmtypen, Kollisionen, Gold, Bauflächen, Upgrades, Verkauf, identische Simulation und Koop-Autorität. WebSocket-Integration verwendet eigene Ports 2568/2569/2572/2573. Browserprüfungen decken verschlüsselte Speicherung, parallele Tabs, Fehler/Sicherung, echte Kampfwellen, Teamauswahl und responsive Eingaben ab. `verify:balance` spielt alle 15 Missionen mit regulärem Gold und gültigen Teams durch, mit `--coop` zusätzlich als Vierergruppe; erfolgreiche Befehlsfolgen stehen im JSON-Bericht. Der Produktionscheck prüft vollständiges Caching und erneuten Offline-Start.

Grafiklast: 100 animierte Gegner, 30 Türme, alle zehn Turmtypen und wiederholte Kartenwechsel. Berichte und Screenshots liegen in `verification/output/`. Browsermessungen auf dem Entwicklungs-Mac und emulierte Touch-Geräte sind **keine Tests auf physischer Mobilhardware**. Das Ziel von 30 FPS auf repräsentativer Handyhardware muss dort zusätzlich gemessen werden.

## Assets

Lokale CC0-Modelle von Kenney und Quaternius; keine Warcraft-Assets. Sechs tatsächliche Kampagnenillustrationen wurden vor der UI-Implementierung mit dem eingebauten ImageGen erzeugt und visuell geprüft. Sie werden lokal als WebP in großen und kleinen Auflösungen ausgeliefert. Quellen, Lizenzen und Prompts: [ASSETS.md](ASSETS.md), [Generierungsmanifest](scripts/campaign-art.json).

## Lokales Gastspiel

Der Account-Menüpunkt zeigt das Spielstand-Level mit EP-Fortschrittsring. Das Dialogfenster enthält EP bis zum nächsten Level, Forschungspunkte, Slots, Kampagnenfortschritt und Kartenrekorde; Registrierung und Login sind vorerst deaktiviert. Abschüsse und Siege werden seit Einführung der Statistik pro Durchlauf verschlüsselt gespeichert, mit maximalen Zählerständen gegen Doppelzählung bei Wiederverbindung oder parallelen Tabs. Im Koop zählen Gruppenergebnisse. Frühere Gesamtsummen können nicht rekonstruiert werden. `pnpm run verify:account` prüft Ring, Speicherung, Doppelzählung, Tastatur und responsive Dialoggrößen.

### Prismenlanze

Die Prismenlanze kanalisiert einen zielgebundenen arkanen Laser. Basisdauer: 1,2 Sekunden, plus 0,2 Sekunden je zusätzlicher Turmstufe und 0,04 Sekunden je Forschungsschritt (Maximum 2,6 Sekunden). Der Basisschaden von 100 verteilt sich auf 1,2 Sekunden; bestehende Schadensaufwertungen erhöhen den Schaden pro Sekunde. Längere Strahlen verursachen dadurch zusätzlich mehr Gesamtschaden. Verteidigung wird pro Simulationsschritt berücksichtigt. Tod, Reichweitenverlust oder Verkauf beenden den Strahl; ein neuer Impuls beginnt frühestens nach dem Angriffsintervall und 0,25 Sekunden nach der vollen Strahldauer. Aufwertungen wirken auf den nächsten Impuls. Solo und Koop verwenden dieselbe Simulation.

### Codegesteuerte Pause und Gegner-Vorstellungen

`simulation.setPaused('mein-grund', true)` pausiert, `simulation.setPaused('mein-grund', false)` entfernt genau diesen Pausengrund. Sichtbarkeit, Verbindungen und Gegnervorstellung können sich deshalb nicht gegenseitig versehentlich aufheben. Es gibt keinen manuellen Pause-Button. Die interaktiven Worker-/Server-Adapter aktivieren `introductionsEnabled`; reine Headless-Simulationen können Vorstellungen weglassen.

Beim ersten regulären Spawn jedes Gegnertyps pro Durchlauf wird die gesamte Simulation angehalten. Das Modal zeigt das lokale animierte 3D-Modell und taktische Hinweise. `ackIntroduction` bestätigt ausschließlich die aktuelle Vorstellung für den jeweiligen Spieler. Im Koop müssen alle verbliebenen Teilnehmer bestätigen; getrennte Teilnehmer behalten ihren Platz während der Wiederverbindungsfrist. Nach endgültigem Verlassen entfällt ihre Stimme. Badges zeigen den Bereitschaftsstand. Neustarts setzen die entdeckten Gegnertypen zurück. `node verification/introduction.mjs` prüft die mobile Solo-Vorstellung und den Ablauf mit zwei tatsächlichen Koop-Clients.

### Koop-Baugebiete

In der Lobby öffnet „Baugebiete“ die Kartenvorschau. Standard: Jeder darf überall bauen. Schon allein kann der Host West–Ost-Streifen, Nord–Süd-Streifen oder Sektoren vorwählen. Beim Beitritt weiterer Spieler entstehen automatisch 2–4 Gebiete. Der Host ordnet die nummerierten Gebiete Spielern zu; jede Änderung und jeder Wechsel der Lobbybesetzung setzt die Bereitschaft zurück. Die Turmmitte entscheidet über das Gebiet, bestehende Weg-/Hindernisregeln bleiben gültig. Server und Drag-Vorschau verwenden dieselbe Prüfung. Im Durchlauf sind die Grenzen fest; eine vorübergehende Trennung ändert nichts, bei endgültigem Verlassen erbt der Host das verlassene Gebiet. Die Gruppenansicht zeigt die Aufteilung auch im laufenden Spiel. Gestrichelte Linien markieren die Gebietsgrenzen auf der 3D-Karte. Beim Ziehen eines Turms werden fremde Gebiete abgedunkelt; das eigene Gebiet bleibt farbig. `node verification/territories.mjs` prüft eine echte Drei-Client-Lobby einschließlich Zuordnung, Vorschau und Bauverboten.
