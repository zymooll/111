import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Space, Typography } from 'antd';
import type { CursorListResult } from '../hooks/useCursorList';

interface CursorPaginationProps {
  list: CursorListResult<unknown>;
  /** Rendered only when the endpoint reports a total; pages without one just show the page number. */
  totalLabel?: (total: number) => string;
}

export function CursorPagination({ list, totalLabel }: CursorPaginationProps) {
  return (
    <div className="cursor-pagination">
      <Typography.Text type="secondary">
        {list.total !== undefined && totalLabel ? `${totalLabel(list.total)} · ` : ''}
        第 {list.pageNumber} 页
      </Typography.Text>
      <Space size={8}>
        <Button
          size="small"
          icon={<LeftOutlined />}
          disabled={!list.hasPrevious || list.loading}
          onClick={list.previous}
        >
          上一页
        </Button>
        <Button
          size="small"
          disabled={!list.hasNext || list.loading}
          onClick={list.next}
        >
          下一页 <RightOutlined />
        </Button>
      </Space>
    </div>
  );
}
