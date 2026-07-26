import { EyeOutlined, LockOutlined, ReloadOutlined, SearchOutlined, UnlockOutlined } from '@ant-design/icons';
import { App, Button, Card, Descriptions, Drawer, Input, Select, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useState } from 'react';
import { adminApi } from '../api/client';
import { CursorPagination } from '../components/CursorPagination';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import { useCursorList } from '../hooks/useCursorList';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { CampusUser, CursorQuery, EntityStatus } from '../types';

const pageSize = 10;

export function UsersPage() {
  const { message, modal } = App.useApp();
  const [keyword, setKeyword] = useState('');
  const [activity, setActivity] = useState('');
  const [selected, setSelected] = useState<CampusUser>();
  const search = useDebouncedValue(keyword);

  const handleError = useCallback((error: unknown) => {
    message.error(error instanceof Error ? error.message : '用户列表加载失败');
  }, [message]);

  const loadPage = useCallback(
    (query: CursorQuery, signal: AbortSignal) => adminApi.users({
      ...query,
      search: search.trim() || undefined,
      active: activity === '' ? undefined : activity === 'active',
    }, signal),
    [activity, search],
  );

  const list = useCursorList(loadPage, pageSize, handleError);

  const changeStatus = (user: CampusUser, nextStatus: EntityStatus) => {
    modal.confirm({
      title: nextStatus === 'frozen' ? `冻结用户“${user.username}”？` : `恢复用户“${user.username}”？`,
      content: nextStatus === 'frozen' ? '冻结后该用户无法登录、评价或收藏，但历史内容不会自动删除。' : '恢复后用户可重新登录并使用互动功能。',
      okText: nextStatus === 'frozen' ? '确认冻结' : '确认恢复',
      okButtonProps: { danger: nextStatus === 'frozen' },
      async onOk() {
        try {
          await adminApi.updateUser(user.id, nextStatus);
          message.success(nextStatus === 'frozen' ? '用户已冻结' : '用户已恢复');
          list.reload();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '账号状态更新失败');
        }
      },
    });
  };

  const resetPassword = (user: CampusUser) => {
    modal.confirm({
      title: '发送密码重置邮件？',
      content: `系统将向 ${user.email} 发送一次性密码重置链接。`,
      okText: '确认发送',
      async onOk() {
        try {
          await adminApi.resetPassword(user.id);
          message.success('密码重置邮件已发送');
        } catch (error) {
          message.error(error instanceof Error ? error.message : '密码重置请求失败');
        }
      },
    });
  };

  const columns: ColumnsType<CampusUser> = [
    {
      title: '用户', key: 'user', width: 230,
      render: (_, record) => <div className="table-primary"><strong>{record.username}</strong><span>{record.email}</span></div>,
    },
    { title: '状态', dataIndex: 'status', width: 100, render: (value) => <StatusTag status={value} /> },
    { title: '评价', dataIndex: 'reviewCount', width: 90, render: (value) => `${value} 条` },
    { title: '影响阅读', dataIndex: 'impactViews', width: 110, render: (value: number) => value.toLocaleString() },
    { title: '收藏', dataIndex: 'favoriteCount', width: 90, render: (value) => `${value} 家` },
    { title: '最近活跃', dataIndex: 'lastActive', width: 155 },
    {
      title: '操作', key: 'actions', fixed: 'right', width: 160,
      render: (_, record) => (
        <Space size={2}>
          <Tooltip title="查看详情"><Button type="text" icon={<EyeOutlined />} onClick={() => setSelected(record)} /></Tooltip>
          {record.status === 'frozen'
            ? <Tooltip title="恢复用户"><Button type="text" icon={<UnlockOutlined />} onClick={() => changeStatus(record, 'active')} /></Tooltip>
            : <Tooltip title="冻结用户"><Button danger type="text" icon={<LockOutlined />} onClick={() => changeStatus(record, 'frozen')} /></Tooltip>}
          <Tooltip title="发送密码重置邮件"><Button type="text" icon={<ReloadOutlined />} onClick={() => resetPassword(record)} /></Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="用户管理" description="查询校园用户、管理账号状态并查看行为概览" />
      <div className="summary-strip">
        <Statistic title="本页用户" value={list.items.length} />
        <Statistic title="本页正常" value={list.items.filter((item) => item.status === 'active').length} valueStyle={{ color: '#16a34a' }} />
        <Statistic title="本页待验证" value={list.items.filter((item) => item.status === 'unverified').length} />
        <Statistic title="本页已冻结" value={list.items.filter((item) => item.status === 'frozen').length} valueStyle={{ color: '#e5484d' }} />
      </div>
      <Card bordered={false}>
        <div className="table-toolbar">
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索用户名或邮箱"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="wide-search"
            />
            <Select
              value={activity}
              onChange={setActivity}
              options={[{ value: '', label: '全部账号' }, { value: 'active', label: '已启用' }, { value: 'frozen', label: '已冻结' }]}
              style={{ width: 132 }}
            />
          </Space>
          <Button icon={<ReloadOutlined />} onClick={list.reload}>刷新</Button>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={list.items}
          loading={list.loading}
          scroll={{ x: 1000 }}
          pagination={false}
        />
        <CursorPagination list={list} />
      </Card>

      <Drawer title="用户详情" width={520} open={Boolean(selected)} onClose={() => setSelected(undefined)}>
        {selected && (
          <>
            <div className="drawer-identity">
              <div className="user-avatar-large">{selected.username.slice(0, 1)}</div>
              <div><h2>{selected.username}</h2><Typography.Text type="secondary">{selected.id}</Typography.Text></div>
              <StatusTag status={selected.status} />
            </div>
            <Descriptions column={1} bordered size="small" className="drawer-descriptions">
              <Descriptions.Item label="邮箱">{selected.email}</Descriptions.Item>
              <Descriptions.Item label="注册时间">{selected.createdAt}</Descriptions.Item>
              <Descriptions.Item label="最近活跃">{selected.lastActive}</Descriptions.Item>
              <Descriptions.Item label="饮食偏好">{selected.dietaryTags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</Descriptions.Item>
            </Descriptions>
            <div className="drawer-stats">
              <Statistic title="已发布评价" value={selected.reviewCount} suffix="条" />
              <Statistic title="累计阅读" value={selected.impactViews} />
              <Statistic title="收藏商家" value={selected.favoriteCount} suffix="家" />
            </div>
            <Card size="small" title="管理说明" className="drawer-note">
              用户行为只显示聚合数据，不暴露精确位置轨迹。冻结账号不会删除历史评价，内容处置请前往评价管理。
            </Card>
          </>
        )}
      </Drawer>
    </div>
  );
}
