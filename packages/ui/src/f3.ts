/**
 * @ats/ui/f3 — F3 segment-view MFE'sinin DAR tüketim yüzeyi (Codex #68 blocker-1):
 * MFE kök @ats/ui'ı import ETMEZ; bundle'a yalnız bu dörtlü + bağımlılıkları girer.
 * Yeni ihtiyaç = bu dosyaya AÇIK ekleme (görünür karar) — star-export yasak.
 */
export { Button } from "./primitives/button/Button";
export { Input } from "./primitives/input/Input";
export { Text } from "./primitives/text/Text";
export { Badge } from "./primitives/badge/Badge";
