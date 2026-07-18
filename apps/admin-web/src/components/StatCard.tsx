import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { Card, Skeleton, Statistic } from 'antd';
import type { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value?: number;
  suffix?: string;
  trend?: number;
  icon: ReactNode;
  tone?: 'blue' | 'green' | 'orange' | 'purple';
  loading?: boolean;
}

export function StatCard({ title, value, suffix, trend, icon, tone = 'blue', loading }: StatCardProps) {
  return (
    <Card className="stat-card" bordered={false}>
      {loading ? <Skeleton active paragraph={{ rows: 1 }} /> : (
        <div className="stat-card-content">
          <div className={`stat-icon stat-icon-${tone}`}>{icon}</div>
          <div className="stat-main">
            <Statistic title={title} value={value ?? 0} suffix={suffix} />
            {trend !== undefined && (
              <div className={trend >= 0 ? 'stat-trend-positive' : 'stat-trend-negative'}>
                {trend >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(trend)}%
                <span> 较上周</span>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
