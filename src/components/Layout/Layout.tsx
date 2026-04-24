import './Layout.css';

interface LayoutProps {
  sidebar: React.ReactNode;
  map: React.ReactNode;
}

export function Layout({ sidebar, map }: LayoutProps) {
  return (
    <div className="layout">
      <div className="layout-sidebar">{sidebar}</div>
      <div className="layout-map">{map}</div>
    </div>
  );
}
