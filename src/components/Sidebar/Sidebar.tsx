import { PrefectureSelect } from './PrefectureSelect';
import { StatsPanel } from './StatsPanel';
import type { ComparisonInfo } from '../../App';
import './Sidebar.css';

interface Props {
  selectedCode: number | null;
  onSelect: (code: number) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  comparison: ComparisonInfo | null;
}

export function Sidebar({
  selectedCode,
  onSelect,
  loading,
  error,
  onRetry,
  comparison,
}: Props) {
  return (
    <div className="sidebar">
      <header className="sidebar-header">
        <h1 className="sidebar-title">都道府県 <span>面積比較</span></h1>
        <p className="sidebar-subtitle">都道府県の大きさを世界地図で比較</p>
      </header>

      <div className="sidebar-body">
        <PrefectureSelect value={selectedCode} onChange={onSelect} />
        <StatsPanel
          selectedCode={selectedCode}
          loading={loading}
          error={error}
          onRetry={onRetry}
          comparison={comparison}
        />
      </div>
    </div>
  );
}
