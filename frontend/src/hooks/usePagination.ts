import { useState, useCallback, useMemo } from 'react';

export interface PaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
  totalItems?: number;
}

export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startIndex: number;
  endIndex: number;
}

export interface PaginationActions {
  setPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  setPageSize: (size: number) => void;
  setTotalItems: (total: number) => void;
  reset: () => void;
}

export function usePagination(options: PaginationOptions = {}) {
  const {
    initialPage = 1,
    initialPageSize = 20,
    totalItems: initialTotalItems = 0
  } = options;

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [totalItems, setTotalItems] = useState(initialTotalItems);

  const paginationState: PaginationState = useMemo(() => {
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize - 1, totalItems - 1);

    return {
      currentPage,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPreviousPage: currentPage > 1,
      startIndex,
      endIndex
    };
  }, [currentPage, pageSize, totalItems]);

  const actions: PaginationActions = useMemo(() => ({
    setPage: (page: number) => {
      const maxPage = Math.ceil(totalItems / pageSize);
      setCurrentPage(Math.max(1, Math.min(page, maxPage)));
    },
    
    nextPage: () => {
      if (paginationState.hasNextPage) {
        setCurrentPage(prev => prev + 1);
      }
    },
    
    previousPage: () => {
      if (paginationState.hasPreviousPage) {
        setCurrentPage(prev => prev - 1);
      }
    },
    
    setPageSize: (size: number) => {
      setPageSize(size);
      // Adjust current page to maintain position
      const currentStartIndex = (currentPage - 1) * pageSize;
      const newPage = Math.floor(currentStartIndex / size) + 1;
      setCurrentPage(newPage);
    },
    
    setTotalItems: (total: number) => {
      setTotalItems(total);
      // Adjust current page if it's beyond the new total
      const maxPage = Math.ceil(total / pageSize);
      if (currentPage > maxPage && maxPage > 0) {
        setCurrentPage(maxPage);
      }
    },
    
    reset: () => {
      setCurrentPage(initialPage);
      setPageSize(initialPageSize);
      setTotalItems(initialTotalItems);
    }
  }), [currentPage, pageSize, totalItems, paginationState.hasNextPage, paginationState.hasPreviousPage, initialPage, initialPageSize, initialTotalItems]);

  return {
    ...paginationState,
    ...actions
  };
}