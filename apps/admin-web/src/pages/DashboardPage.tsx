import {
  ArrowRightOutlined,
  AuditOutlined,
  EyeOutlined,
  FileTextOutlined,
  ShopOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Empty, List, Rate, Row, Skeleton, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { StatusTag } from '../components/StatusTag';
import type { DashboardData } from '../types';

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>();
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    adminApi.dashboard()
      .then(setData)
      .catch((error) => message.error(error instanceof Error ? error.message : '概览加载失败'))
      .finally(() => setLoading(false));
  }, []);

  const maxTraffic = useMemo(() => Math.max(1, ...(data?.weeklyTraffic.map((item) => item.views) ?? [1])), [data]);

  return (
    <div>
      <PageHeader
        title="运营概览"
        description="查看校园餐饮生态的实时状态与关键趋势"
        extra={<Button type="primary" icon={<AuditOutlined />} onClick={() => navigate('/reviews')}>处理待审评价</Button>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}><StatCard title="注册用户" value={data?.users} trend={data?.userGrowth} icon={<TeamOutlined />} loading={loading} /></Col>
        <Col xs={24} md={12} xl={6}><StatCard title="入驻商家" value={data?.merchants} trend={data?.merchantGrowth} icon={<ShopOutlined />} tone="green" loading={loading} /></Col>
        <Col xs={24} md={12} xl={6}><StatCard title="菜品 / 套餐" value={data?.menuItems} icon={<FileTextOutlined />} tone="purple" loading={loading} /></Col>
        <Col xs={24} md={12} xl={6}><StatCard title="待人工审核" value={data?.pendingReviews} suffix="条" icon={<AuditOutlined />} tone="orange" loading={loading} /></Col>
      </Row>

      <Row gutter={[16, 16]} className="dashboard-row">
        <Col xs={24} xl={16}>
          <Card title="近 7 日访问与推荐" bordered={false} extra={<Typography.Text type="secondary">单位：次</Typography.Text>}>
            {loading ? <Skeleton active paragraph={{ rows: 7 }} /> : (
              <div className="traffic-chart" aria-label="近 7 日访问趋势">
                {data?.weeklyTraffic.map((item) => (
                  <div className="traffic-column" key={item.date}>
                    <div className="traffic-bars">
                      <div className="traffic-bar traffic-bar-view" style={{ height: `${Math.max(12, item.views / maxTraffic * 150)}px` }} title={`访问 ${item.views}`} />
                      <div className="traffic-bar traffic-bar-recommend" style={{ height: `${Math.max(12, item.recommendations / maxTraffic * 150)}px` }} title={`推荐 ${item.recommendations}`} />
                    </div>
                    <span>{item.date}</span>
                  </div>
                ))}
                <div className="chart-legend"><span><i className="legend-view" />页面访问</span><span><i className="legend-recommend" />推荐曝光</span></div>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="热门品类分布" bordered={false} className="full-height-card">
            {loading ? <Skeleton active paragraph={{ rows: 6 }} /> : (
              <div className="category-list">
                {data?.categoryShare.map((item) => (
                  <div key={item.name} className="category-row">
                    <div><span className="category-dot" style={{ background: item.color }} />{item.name}<strong>{item.value}%</strong></div>
                    <div className="category-track"><span style={{ width: `${item.value}%`, background: item.color }} /></div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="dashboard-row">
        <Col xs={24} xl={15}>
          <Card
            title="最新评价"
            bordered={false}
            extra={<Button type="link" onClick={() => navigate('/reviews')}>查看全部 <ArrowRightOutlined /></Button>}
          >
            <Table
              rowKey="id"
              size="middle"
              loading={loading}
              dataSource={data?.recentReviews}
              pagination={false}
              locale={{ emptyText: <Empty description="暂无评价" /> }}
              columns={[
                { title: '评价用户', dataIndex: 'userName', width: 130 },
                { title: '菜品', dataIndex: 'itemName', ellipsis: true },
                { title: '评分', dataIndex: 'rating', width: 90, render: (value: number) => <span className="rating-value">★ {value}</span> },
                { title: '状态', dataIndex: 'status', width: 120, render: (value) => <StatusTag status={value} /> },
                { title: '时间', dataIndex: 'createdAt', width: 150, render: (value: string) => value.slice(5) },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="本周热门菜品" bordered={false} className="full-height-card">
            <List
              loading={loading}
              dataSource={data?.popularItems}
              renderItem={(item, index) => (
                <List.Item>
                  <div className={`ranking-number ranking-${index + 1}`}>{index + 1}</div>
                  <List.Item.Meta title={item.name} description={item.merchant} />
                  <Space direction="vertical" size={0} align="end">
                    <span className="rating-value"><Rate disabled value={1} count={1} /> {item.rating}</span>
                    <Typography.Text type="secondary"><EyeOutlined /> {item.views.toLocaleString()}</Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
      <AlertStrip pending={data?.pendingReviews ?? 0} />
    </div>
  );
}

function AlertStrip({ pending }: { pending: number }) {
  return (
    <Card className="operation-tip" bordered={false}>
      <Space wrap>
        <Tag color="processing">运营提醒</Tag>
        <Typography.Text>当前有 <strong>{pending} 条</strong> 评价等待人工审核，请及时进入审核工作台处理。</Typography.Text>
      </Space>
    </Card>
  );
}
