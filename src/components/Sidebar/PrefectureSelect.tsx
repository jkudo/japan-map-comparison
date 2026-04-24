import { PREFECTURE_DATA, REGIONS } from '../../data/prefectureAreas';
import { JAPAN_WHOLE_CODE } from '../../hooks/usePrefectureGeoJSON';
import './PrefectureSelect.css';

interface Props {
  value: number | null;
  onChange: (code: number) => void;
}

export function PrefectureSelect({ value, onChange }: Props) {
  return (
    <div className="prefecture-select">
      <label htmlFor="pref-select" className="select-label">
        都道府県を選択
      </label>
      <select
        id="pref-select"
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className="select-input"
      >
        <option value="" disabled>
          ── 選択してください ──
        </option>

        {/* 日本全体オプション */}
        <option value={JAPAN_WHOLE_CODE}>
          🗾 {PREFECTURE_DATA[JAPAN_WHOLE_CODE].nameJa}
        </option>

        <optgroup label="──────────────" disabled />

        {REGIONS.map((region) => {
          const prefs = Object.entries(PREFECTURE_DATA).filter(
            ([code, data]) => data.region === region && Number(code) !== JAPAN_WHOLE_CODE
          );
          return (
            <optgroup key={region} label={region}>
              {prefs.map(([code, data]) => (
                <option key={code} value={code}>
                  {data.nameJa}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}
