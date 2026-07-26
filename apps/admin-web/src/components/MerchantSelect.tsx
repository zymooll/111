import { Select } from 'antd';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { adminApi } from '../api/client';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { Merchant } from '../types';

interface MerchantOption {
  value: string;
  label: string;
}

interface MerchantSelectProps {
  value?: string;
  onChange?: (value?: string, option?: MerchantOption) => void;
  /** Keeps the already-selected merchant visible even when it is outside the current search page. */
  selectedLabel?: string;
  placeholder?: string;
  allowClear?: boolean;
  style?: CSSProperties;
}

const pageSize = 20;

/** Searches merchants on the server so the option list never silently drops matches. */
export function MerchantSelect({ value, onChange, selectedLabel, placeholder, allowClear, style }: MerchantSelectProps) {
  const [keyword, setKeyword] = useState('');
  const [items, setItems] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const search = useDebouncedValue(keyword);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    adminApi.merchants({ search: search.trim() || undefined, limit: pageSize }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setHasMore(page.hasMore);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setItems([]);
        setHasMore(false);
        setLoading(false);
      });
    return () => controller.abort();
  }, [search]);

  const options = useMemo<MerchantOption[]>(() => {
    const list = items.map((merchant) => ({ value: merchant.id, label: merchant.name }));
    if (value && selectedLabel && !list.some((option) => option.value === value)) {
      list.unshift({ value, label: selectedLabel });
    }
    return list;
  }, [items, selectedLabel, value]);

  return (
    <Select<string, MerchantOption>
      showSearch
      allowClear={allowClear}
      value={value}
      loading={loading}
      style={style}
      placeholder={placeholder ?? '输入商家名称检索'}
      filterOption={false}
      searchValue={keyword}
      onSearch={setKeyword}
      onChange={(next, option) => onChange?.(next ?? undefined, Array.isArray(option) ? option[0] : option)}
      options={options}
      notFoundContent={loading ? '正在检索…' : '没有匹配的商家'}
      popupRender={(menu) => (
        <>
          {menu}
          {hasMore && <div className="select-more-hint">仅列出前 {pageSize} 家，请输入关键词继续检索</div>}
        </>
      )}
    />
  );
}
