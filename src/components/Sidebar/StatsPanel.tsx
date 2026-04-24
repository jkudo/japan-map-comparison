import { PREFECTURE_DATA } from '../../data/prefectureAreas';
import type { ComparisonInfo } from '../../App';
import './StatsPanel.css';

interface Props {
  selectedCode: number | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  comparison: ComparisonInfo | null;
}

function formatRatio(prefArea: number, countryArea: number): string {
  if (countryArea <= 0) return '';
  const ratio = countryArea / prefArea;
  if (ratio >= 1) {
    // 国の方が大きい: 「約XX個分入る」
    if (ratio >= 100) return `約 ${Math.round(ratio).toLocaleString('ja-JP')} 個分`;
    if (ratio >= 10) return `約 ${ratio.toFixed(1)} 個分`;
    return `約 ${ratio.toFixed(2)} 個分`;
  } else {
    // 都道府県の方が大きい: 「約XX倍の大きさ」
    const inv = 1 / ratio;
    if (inv >= 10) return `約 ${Math.round(inv).toLocaleString('ja-JP')} 倍の大きさ`;
    return `約 ${inv.toFixed(2)} 倍の大きさ`;
  }
}

export function StatsPanel({ selectedCode, loading, error, onRetry, comparison }: Props) {
  const data = selectedCode !== null ? PREFECTURE_DATA[selectedCode] : null;

  if (!data) {
    return (
      <div className="stats-panel stats-panel--empty">
        <p className="stats-hint stats-hint--full">← 日本全体または都道府県を選択すると輪郭が表示されます</p>
        <p className="stats-hint-sub">ドラッグして各国と面積を比較できます</p>
      </div>
    );
  }

  return (
    <div className="stats-panel">
      <div className="stats-main-row">
        <div className="stats-name">
          <span className="stats-name-ja">{data.nameJa}</span>
          <span className="stats-name-en">{data.nameEn}</span>
        </div>

        <div className="stats-area">
          <span className="stats-area-label">面積</span>
          <span className="stats-area-value">
            {data.areaKm2.toLocaleString('ja-JP')}
            <span className="stats-area-unit"> km²</span>
          </span>
        </div>

        <div className="stats-region">
          <span className="stats-region-label">地方:</span>
          <span className="stats-region-value">{data.region}</span>
        </div>
      </div>

      {loading && (
        <div className="stats-loading">
          <div className="loading-spinner" />
          <span>地図データを読み込み中...</span>
        </div>
      )}

      {error && (
        <div className="stats-error">
          <span>{error}</span>
          <button className="retry-btn" onClick={onRetry}>
            再試行
          </button>
        </div>
      )}

      {/* 比較結果 */}
      {comparison && comparison.countryAreaKm2 > 0 ? (
        // 国・面積ともにデータあり
        <div className="comparison-panel">
          <div className="comparison-country">
            <span className="comparison-label">現在地</span>
            <span className="comparison-country-name">{comparison.countryNameJa}</span>
            <span className="comparison-country-area">
              {comparison.countryAreaKm2.toLocaleString('ja-JP')} km²
            </span>
          </div>
          <div className="comparison-result">
            <span className="comparison-result-label">比較</span>
            <span className="comparison-result-value">
              {comparison.countryNameJa}に
            </span>
            <span className="comparison-result-ratio">
              {formatRatio(data.areaKm2, comparison.countryAreaKm2)}
            </span>
            <span className="comparison-result-note">
              {comparison.countryAreaKm2 >= data.areaKm2
                ? `（${comparison.countryNameJa}の中に${data.nameJa}が入る数）`
                : `（${data.nameJa}は${comparison.countryNameJa}より大きい）`}
            </span>
          </div>
        </div>
      ) : comparison && comparison.countryAreaKm2 === -1 ? (
        // 国は特定できたが面積データなし
        <div className="comparison-panel comparison-panel--nodata">
          <div className="comparison-country">
            <span className="comparison-label">現在地</span>
            <span className="comparison-country-name">{comparison.countryNameJa}</span>
          </div>
          <div className="comparison-nodata">面積データなし</div>
        </div>
      ) : comparison && comparison.countryAreaKm2 === 0 ? (
        // 海上
        <div className="comparison-panel comparison-panel--ocean">
          <span className="comparison-label">現在地</span>
          <span className="comparison-ocean">海上・該当国なし</span>
        </div>
      ) : !loading && !error ? (
        <div className="stats-drag-hint">
          赤い輪郭をドラッグして国と比較してみましょう
        </div>
      ) : null}
    </div>
  );
}
