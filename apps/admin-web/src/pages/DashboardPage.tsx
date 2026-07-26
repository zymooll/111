import {
  ArrowRightOutlined,
  AuditOutlined,
  FileTextOutlined,
  ShopOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Empty, Row, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
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
    const controller = new AbortController();
    adminApi.dashboard(controller.signal)
      .then((value) => { if (!controller.signal.aborted) setData(value); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        message.error(error instanceof Error ? error.message : '概览加载失败');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  return (
    <div>
      <PageHeader
        title="运营概览"
        description="查看校园餐饮生态的实时状态与关键指标"
        extra={<Button type="primary" icon={<AuditOutlined />} onClick={() => navigate('/reviews')}>处理待审评价</Button>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}><StatCard title="注册用户" value={data?.users} icon={<TeamOutlined />} loading={loading} /></Col>
        <Col xs={24} md={12} xl={6}><StatCard title="已上架商家" value={data?.merchants} icon={<ShopOutlined />} tone="green" loading={loading} /></Col>
        <Col xs={24} md={12} xl={6}><StatCard title="已上架菜品 / 套餐" value={data?.menuItems} icon={<FileTextOutlined />} tone="purple" loading={loading} /></Col>
        <Col xs={24} md={12} xl={6}><StatCard title="待人工审核" value={data?.pendingReviews} suffix="条" icon={<AuditOutlined />} tone="orange" loading={loading} /></Col>
      </Row>

      <Card
        title="最新评价"
        bordered={false}
        className="dashboard-row"
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
            { title: '时间', dataIndex: 'createdAt', width: 165 },
          ]}
        />
      </Card>

      <Card className="operation-tip" bordered={false}>
        <Space wrap>
          <Tag color="processing">运营提醒</Tag>
          <Typography.Text>当前有 <strong>{data?.pendingReviews ?? 0} 条</strong> 评价等待人工审核，请及时进入审核工作台处理。</Typography.Text>
        </Space>
      </Card>
    </div>
  );
}
