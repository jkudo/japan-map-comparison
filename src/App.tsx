import { useState, useCallback } from 'react';
import { Layout } from './components/Layout/Layout';
import { MapLibrePocMap } from './components/MapView/MapLibrePocMap';
import { Sidebar } from './components/Sidebar/Sidebar';
import { usePrefectureGeoJSON } from './hooks/usePrefectureGeoJSON';
import { detectCountry } from './utils/countryDetector';
import { COUNTRY_DATA } from './data/countryAreas';

export interface ComparisonInfo {
  countryIso: string;
  countryNameJa: string;
  countryNameEn: string;
  countryAreaKm2: number;
}

const regionNamesJa =
  typeof Intl !== 'undefined'
    ? new Intl.DisplayNames(['ja'], { type: 'region' })
    : null;

function fallbackCountryNameJa(iso: string, englishName: string): string {
  if (iso === '-1') return '海上・不明';
  if (iso.length === 2 && regionNamesJa) {
    const localized = regionNamesJa.of(iso.toUpperCase());
    if (localized) return localized;
  }
  if (englishName && /^[\x20-\x7E]+$/.test(englishName)) {
    return `${englishName}（日本語名未登録）`;
  }
  return '日本語名未登録の国';
}

export default function App() {
  const [selectedCode, setSelectedCode] = useState<number | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [comparison, setComparison] = useState<ComparisonInfo | null>(null);

  const { feature, loading, error } = usePrefectureGeoJSON(selectedCode);

  const handleSelect = useCallback((code: number) => {
    setSelectedCode(code);
    setRetryKey(0);
    setComparison(null);
  }, []);

  const handleRetry = useCallback(() => {
    setRetryKey((n) => n + 1);
    setSelectedCode((prev) => {
      const code = prev;
      setTimeout(() => setSelectedCode(code), 0);
      return null;
    });
    setComparison(null);
  }, []);

  const handleDragEnd = useCallback(async (centroid: [number, number]) => {
    const { iso, name } = await detectCountry(centroid);
    const data = COUNTRY_DATA[iso];
    setComparison({
      countryIso: iso,
      countryNameJa: data?.nameJa ?? fallbackCountryNameJa(iso, name),
      countryNameEn: data?.nameEn ?? name,
      countryAreaKm2: data?.areaKm2 ?? -1,
    });
  }, []);

  return (
    <Layout
      key={retryKey}
      sidebar={
        <Sidebar
          selectedCode={selectedCode}
          onSelect={handleSelect}
          loading={loading}
          error={error}
          onRetry={handleRetry}
          comparison={comparison}
        />
      }
      map={<MapLibrePocMap feature={feature} onDragEnd={handleDragEnd} />}
    />
  );
}
