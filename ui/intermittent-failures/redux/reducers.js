import moment from 'moment';

import { setDateRange } from '../helpers';

export const fetchData = (name = '') => (state = { data: {}, message: {}, failureStatus: null, isFetching: true }, action) => {
  switch (action.type) {
    case `REQUESTING_${name}_DATA`:
      return {
        ...state,
        isFetching: true,
      };
    case `FETCH_${name}_SUCCESS`:
      return {
        ...state,
        data: action.data,
        isFetching: false,
      };
    case `FETCH_${name}_FAILURE`:
      return {
        ...state,
        message: action.message,
        failureStatus: action.failureStatus,
        isFetching: false,
      };
    case `${name}_ERROR`:
      return {
        ...state,
        isFetching: false,
      };
    default:
      return state;
  }
};

export const updateDates = (name = '') => (state = setDateRange(moment().utc(), 7), action) => {
  switch (action.type) {
    case `UPDATE_${name}_DATE_RANGE`:
      return {
        ...state,
        from: action.from,
        to: action.to,
      };
    default:
      return state;
  }
};

export const updateTree = (name = '') => (state = { tree: 'trunk' }, action) => {
  switch (action.type) {
    case `UPDATE_${name}_VIEW_TREE`:
      return {
        ...state,
        tree: action.tree,
      };
    default:
      return state;
  }
};

export const updateBugDetails = (name = '') => (state = { bugId: null, summary: null }, action) => {
  switch (action.type) {
    case `UPDATE_SELECTED_${name}`:
      return {
        ...state,
        bugId: action.bugId,
        summary: action.summary,
      };
    default:
      return state;
  }
};
