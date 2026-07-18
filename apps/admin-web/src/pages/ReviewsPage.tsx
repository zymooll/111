import { CheckOutlined, CloseOutlined, EyeInvisibleOutlined, EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Card, Descriptions, Drawer, Empty, Input, Modal, Rate, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import type { Review, ReviewStatus } from '../types';

const riskConfig = {
  low: { color: 'success', label: '低风险' },
  medium: { color: 'warning', label: '中风险' },
  high: { color: 'error', label: '高风险' },
};

export function ReviewsPage() {
  const { message, modal } = App.useApp();
  const [items, setItems] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('pending_manual');
  const [riskLevel, setRiskLevel] = useState('');
  const [rating, setRating] = useState<number>();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Review>();
  const [actionTarget, setActionTarget] = useState<Review>();
  const [actionStatus, setActionStatus] = useState<ReviewStatus>('rejected');
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [summary, setSummary] = useState({ pending: 0, published: 0, rejected: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi.reviews({ keyword, status: status === 'all' ? '' : status, riskLevel, rating, page, pageSize: 10 });
      setItems(result.items);
      setTotal(result.total);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '评价列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, message, page, rating, riskLevel, status]);

  const loadSummary = useCallback(async () => {
    try {
      const [pending, published, rejected] = await Promise.all([
        adminApi.reviews({ status: 'pending_manual', page: 1, pageSize: 100 }),
        adminApi.reviews({ status: 'published', page: 1, pageSize: 100 }),
        adminApi.reviews({ status: 'rejected', page: 1, pageSize: 100 }),
      ]);
      setSummary({ pending: pending.total, published: published.total, rejected: rejected.total });
    } catch {
      // The main table surfaces request failures; summary counters remain at their last values.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const approve = (record: Review) => {
    modal.confirm({
      title: '确认通过这条评价？',
      content: '通过后评价将立即公开，并参与菜品与商家评分计算。',
      okText: '通过并发布',
      async onOk() {
        await adminApi.reviewAction(record.id, 'published');
        message.success('评价已通过并发布');
        setSelected(undefined);
        await Promise.all([load(), loadSummary()]);
      },
    });
  };

  const openAction = (record: Review, next: ReviewStatus) => {
    setActionTarget(record);
    setActionStatus(next);
    setReason(record.reason || '');
  };

  const submitAction = async () => {
    if (!actionTarget) return;
    if (!reason.trim()) {
      message.warning('请填写处置原因');
      return;
    }
    setActionLoading(true);
    try {
      await adminApi.reviewAction(actionTarget.id, actionStatus, reason.trim());
      message.success(actionStatus === 'rejected' ? '评价已驳回' : '评价已下架');
      setActionTarget(undefined);
      setSelected(undefined);
      await Promise.all([load(), loadSummary()]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const columns: ColumnsType<Review> = [
    { title: '评价内容', key: 'content', width: 360, render: (_, record) => <div className="review-cell"><strong>{record.itemName}</strong><span>{record.content}</span><small>{record.merchantName}</small></div> },
    { title: '用户', dataIndex: 'userName', width: 130 },
    { title: '评分', dataIndex: 'rating', width: 90, render: (value: number) => <span className="rating-value">★ {value}</span> },
    { title: '风险', dataIndex: 'riskLevel', width: 100, render: (value: Review['riskLevel']) => <Tag color={riskConfig[value].color}>{riskConfig[value].label}</Tag> },
    { title: '状态', dataIndex: 'status', width: 120, render: (value) => <StatusTag status={value} /> },
    { title: '发表时间', dataIndex: 'createdAt', width: 155 },
    {
      title: '操作', key: 'actions', fixed: 'right', width: 160,
      render: (_, record) => <Space size={2}>
        <Button type="text" icon={<EyeOutlined />} onClick={() => setSelected(record)}>详情</Button>
        {record.status === 'pending_manual' && <Button type="text" className="success-action" icon={<CheckOutlined />} onClick={() => approve(record)}>通过</Button>}
        {record.status === 'pending_manual' && <Button danger type="text" icon={<CloseOutlined />} onClick={() => openAction(record, 'rejected')}>驳回</Button>}
        {record.status === 'published' && <Button danger type="text" icon={<EyeInvisibleOutlined />} onClick={() => openAction(record, 'hidden')}>下架</Button>}
      </Space>,
    },
  ];

  return (
    <div>
      <PageHeader title="评价审核" description="复核机器标记内容，维护真实、可信的校园餐饮评价环境" />
      <div className="summary-strip review-summary">
        <Statistic title="待人工审核" value={summary.pending} valueStyle={{ color: '#d97706' }} />
        <Statistic title="已发布评价" value={summary.published} valueStyle={{ color: '#16a34a' }} />
        <Statistic title="已驳回评价" value={summary.rejected} valueStyle={{ color: '#e5484d' }} />
        <Statistic title="当前队列总量" value={summary.pending + summary.published + summary.rejected} suffix="条" />
      </div>
      <Card bordered={false}>
        <Tabs
          activeKey={status}
          onChange={(value) => { setStatus(value); setPage(1); }}
          items={[
            { key: 'pending_manual', label: '待人工审核' },
            { key: 'published', label: '已发布' },
            { key: 'rejected', label: '已驳回' },
            { key: 'hidden', label: '已隐藏' },
            { key: 'all', label: '全部评价' },
          ]}
        />
        <div className="table-toolbar review-toolbar">
          <Space wrap>
            <Input allowClear prefix={<SearchOutlined />} placeholder="搜索评价内容、用户或菜品" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} className="wide-search" />
            <Select value={riskLevel} onChange={(value) => { setRiskLevel(value); setPage(1); }} style={{ width: 130 }} options={[{ value: '', label: '全部风险' }, { value: 'low', label: '低风险' }, { value: 'medium', label: '中风险' }, { value: 'high', label: '高风险' }]} />
            <Select allowClear value={rating} onChange={(value) => { setRating(value); setPage(1); }} placeholder="全部评分" style={{ width: 130 }} options={[5, 4, 3, 2, 1].map((value) => ({ value, label: `${value} 星` }))} />
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
        </div>
        <Table rowKey="id" columns={columns} dataSource={items} loading={loading} scroll={{ x: 1150 }} locale={{ emptyText: <Empty description="当前筛选条件下没有评价" /> }} pagination={{ current: page, pageSize: 10, total, showTotal: (value) => `共 ${value} 条评价`, onChange: setPage }} />
      </Card>

      <Drawer title="评价详情" width={600} open={Boolean(selected)} onClose={() => setSelected(undefined)} extra={selected && <StatusTag status={selected.status} />}>
        {selected && (
          <>
            <div className="review-detail-heading">
              <div><Typography.Title level={4}>{selected.itemName}</Typography.Title><Typography.Text type="secondary">{selected.merchantName}</Typography.Text></div>
              <Rate disabled value={selected.rating} />
            </div>
            <div className="review-quote">{selected.content}</div>
            <div className="review-images">
              {selected.images.length ? selected.images.map((image) => <img key={image} src={image} alt="评价上传图片" />) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该评价未上传图片" />}
            </div>
            <Descriptions column={1} bordered size="small" className="drawer-descriptions">
              <Descriptions.Item label="评价 ID">{selected.id}</Descriptions.Item>
              <Descriptions.Item label="发表用户">{selected.userName}（{selected.userId}）</Descriptions.Item>
              <Descriptions.Item label="发表时间">{selected.createdAt}</Descriptions.Item>
              <Descriptions.Item label="机器风险"><Tag color={riskConfig[selected.riskLevel].color}>{riskConfig[selected.riskLevel].label}</Tag></Descriptions.Item>
              {selected.reason && <Descriptions.Item label="处置原因">{selected.reason}</Descriptions.Item>}
            </Descriptions>
            <div className="drawer-actions">
              {selected.status === 'pending_manual' && <Button type="primary" icon={<CheckOutlined />} onClick={() => approve(selected)}>通过并发布</Button>}
              {selected.status === 'pending_manual' && <Button danger icon={<CloseOutlined />} onClick={() => openAction(selected, 'rejected')}>驳回评价</Button>}
              {selected.status === 'published' && <Button danger icon={<EyeInvisibleOutlined />} onClick={() => openAction(selected, 'hidden')}>下架评价</Button>}
            </div>
          </>
        )}
      </Drawer>

      <Modal
        title={actionStatus === 'rejected' ? '驳回评价' : '下架评价'}
        open={Boolean(actionTarget)}
        onCancel={() => setActionTarget(undefined)}
        onOk={() => void submitAction()}
        okText="确认处置"
        okButtonProps={{ danger: true }}
        confirmLoading={actionLoading}
      >
        <Typography.Paragraph type="secondary">处置原因会写入审计日志，便于后续申诉和复核。</Typography.Paragraph>
        <Input.TextArea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={300} showCount placeholder="请填写明确、可复核的处置原因" />
      </Modal>
    </div>
  );
}
