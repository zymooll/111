import { CheckOutlined, CloseOutlined, EyeInvisibleOutlined, EyeOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import { App, Button, Card, Descriptions, Drawer, Empty, Input, Modal, Rate, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { CursorPagination } from '../components/CursorPagination';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import { useCursorList } from '../hooks/useCursorList';
import type { CursorQuery, Review, ReviewStatus } from '../types';

const riskConfig = {
  low: { color: 'success', label: '低风险' },
  medium: { color: 'warning', label: '中风险' },
  high: { color: 'error', label: '高风险' },
};

const summaryStatuses: ReviewStatus[] = ['pending_manual', 'published', 'rejected'];
const pageSize = 10;

export function ReviewsPage() {
  const { message, modal } = App.useApp();
  const [status, setStatus] = useState('pending_manual');
  const [selected, setSelected] = useState<Review>();
  const [actionTarget, setActionTarget] = useState<Review>();
  const [actionStatus, setActionStatus] = useState<ReviewStatus>('rejected');
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [summary, setSummary] = useState<Partial<Record<ReviewStatus, number>>>({});
  const [summaryToken, setSummaryToken] = useState(0);

  const handleError = useCallback((error: unknown) => {
    message.error(error instanceof Error ? error.message : '评价列表加载失败');
  }, [message]);

  const loadPage = useCallback(
    (query: CursorQuery, signal: AbortSignal) => adminApi.reviews({
      ...query,
      status: status === 'all' ? undefined : status as ReviewStatus,
    }, signal),
    [status],
  );

  const list = useCursorList(loadPage, pageSize, handleError);

  useEffect(() => {
    const controller = new AbortController();
    // The list endpoint reports a real total per status; one minimal page each keeps the counters honest.
    Promise.all(summaryStatuses.map((value) => adminApi.reviews({ status: value, limit: 1 }, controller.signal)))
      .then((pages) => {
        if (controller.signal.aborted) return;
        setSummary(Object.fromEntries(summaryStatuses.map((value, index) => [value, pages[index].total])));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [summaryToken]);

  const refresh = useCallback(() => {
    list.reload();
    setSummaryToken((token) => token + 1);
  }, [list]);

  const approve = (record: Review, action: 'publish' | 'restore') => {
    modal.confirm({
      title: action === 'restore' ? '恢复发布这条评价？' : '确认通过这条评价？',
      content: '评价将重新公开展示，并参与菜品与商家评分计算。',
      okText: action === 'restore' ? '恢复发布' : '通过并发布',
      async onOk() {
        try {
          await adminApi.moderateReview(record.id, action);
          message.success(action === 'restore' ? '评价已恢复发布' : '评价已通过并发布');
          setSelected(undefined);
          refresh();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '操作失败');
        }
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
      await adminApi.moderateReview(actionTarget.id, actionStatus === 'rejected' ? 'reject' : 'hide', reason.trim());
      message.success(actionStatus === 'rejected' ? '评价已驳回' : '评价已下架');
      setActionTarget(undefined);
      setSelected(undefined);
      refresh();
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
      title: '操作', key: 'actions', fixed: 'right', width: 175,
      render: (_, record) => <Space size={2}>
        <Button type="text" icon={<EyeOutlined />} onClick={() => setSelected(record)}>详情</Button>
        {record.status === 'pending_manual' && <Button type="text" className="success-action" icon={<CheckOutlined />} onClick={() => approve(record, 'publish')}>通过</Button>}
        {record.status === 'pending_manual' && <Button danger type="text" icon={<CloseOutlined />} onClick={() => openAction(record, 'rejected')}>驳回</Button>}
        {record.status === 'published' && <Button danger type="text" icon={<EyeInvisibleOutlined />} onClick={() => openAction(record, 'hidden')}>下架</Button>}
        {record.status === 'hidden' && <Button type="text" className="success-action" icon={<UndoOutlined />} onClick={() => approve(record, 'restore')}>恢复</Button>}
      </Space>,
    },
  ];

  return (
    <div>
      <PageHeader title="评价审核" description="复核机器标记内容，维护真实、可信的校园餐饮评价环境" />
      <div className="summary-strip review-summary">
        <Statistic title="待人工审核" value={summary.pending_manual ?? '—'} valueStyle={{ color: '#d97706' }} />
        <Statistic title="已发布评价" value={summary.published ?? '—'} valueStyle={{ color: '#16a34a' }} />
        <Statistic title="已驳回评价" value={summary.rejected ?? '—'} valueStyle={{ color: '#e5484d' }} />
      </div>
      <Card bordered={false}>
        <Tabs
          activeKey={status}
          onChange={setStatus}
          items={[
            { key: 'pending_manual', label: '待人工审核' },
            { key: 'published', label: '已发布' },
            { key: 'rejected', label: '已驳回' },
            { key: 'hidden', label: '已隐藏' },
            { key: 'all', label: '全部评价' },
          ]}
        />
        <div className="table-toolbar review-toolbar">
          <Typography.Text type="secondary">评价按发表时间倒序排列，风险等级由服务端审核模型给出。</Typography.Text>
          <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={list.items}
          loading={list.loading}
          scroll={{ x: 1165 }}
          locale={{ emptyText: <Empty description="当前状态下没有评价" /> }}
          pagination={false}
        />
        <CursorPagination list={list} totalLabel={(total) => `共 ${total} 条评价`} />
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
              <Descriptions.Item label="风险等级"><Tag color={riskConfig[selected.riskLevel].color}>{riskConfig[selected.riskLevel].label}</Tag></Descriptions.Item>
              {selected.reason && <Descriptions.Item label="处置原因">{selected.reason}</Descriptions.Item>}
            </Descriptions>
            <div className="drawer-actions">
              {selected.status === 'pending_manual' && <Button type="primary" icon={<CheckOutlined />} onClick={() => approve(selected, 'publish')}>通过并发布</Button>}
              {selected.status === 'pending_manual' && <Button danger icon={<CloseOutlined />} onClick={() => openAction(selected, 'rejected')}>驳回评价</Button>}
              {selected.status === 'published' && <Button danger icon={<EyeInvisibleOutlined />} onClick={() => openAction(selected, 'hidden')}>下架评价</Button>}
              {selected.status === 'hidden' && <Button type="primary" icon={<UndoOutlined />} onClick={() => approve(selected, 'restore')}>恢复发布</Button>}
              {selected.status === 'rejected' && <Typography.Text type="secondary">已驳回的评价不能直接恢复发布，需要用户重新提交后再进入审核队列。</Typography.Text>}
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
