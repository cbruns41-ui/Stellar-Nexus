# Persönliche Planetplätze

Kolonisation ist die einzige Slot-Forschung. Die Heimatwelt braucht Stufe 0.

| Planet einschließlich Heimat | Forschungsstufe |
| --- | --- |
| 1 | 0 |
| 2 | 3 |
| 3 | 7 |
| 4 | 12 |
| 5 | 18 |
| 6 | 25 |
| 7 | 33 |
| 8 | 42 |
| 9 | 52 |
| 10 | 63 |

Fortsetzung: Für Planet n gilt `(n - 1) * (n + 4) / 2`. Das bisherige absolute Limit von 36 persönlichen Planeten bleibt; dafür reicht die Forschung nun bis Stufe 700. Forschungszeiten, Basispreise, Kostenfaktor 1,95 und Kolonieschiffpreise bleiben auf ausdrücklichen Wunsch unverändert. Die tatsächliche Spielzeit bis zu späteren Slots ist damit noch nicht auf 1–2 Jahre kalibriert.

Der Server prüft belegte Plätze plus ausgehende persönliche Kolonisationsflüge vor dem Start. Rückflüge und Allianzkolonisation reservieren keinen persönlichen Platz. Bei der Ankunft wird erneut geprüft. Fehlt inzwischen ein Platz, kehrt das Kolonieschiff zurück.

Bestehende Planeten und Forschungsstufen bleiben erhalten. Imperien über dem neuen Limit können erst expandieren, wenn Kolonisation die Stufe für ihren nächsten Planeten erreicht. Astrophysik wird als Bestandsforschung angezeigt, schaltet keine Slots mehr frei und kann nicht neu beauftragt werden; bestehende Aufträge bleiben erhalten.

Labor, Werft, Imperiumsübersicht und Missionsdialog zeigen belegte, reservierte und freie Plätze sowie den nächsten benötigten Forschungsstand. Der Missionsdialog aktualisiert sich mit dem Spielzustand und blockiert den Start vor dem Absenden.

Prüfung: `npm test`, `npm run check`, `node scripts/verify-tutorial.mjs --colonization` (isolierte lokale Testdatenbank).
