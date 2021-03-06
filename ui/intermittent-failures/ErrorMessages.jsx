import React from 'react';
import PropTypes from 'prop-types';
import { Alert } from 'reactstrap';
import { processErrorMessage } from './helpers';

const ErrorMessages = ({ failureMessage, failureStatus, errorMessages }) => {
  const messages = errorMessages.length > 0 ? errorMessages : processErrorMessage(failureMessage, failureStatus);

  return (
    <div>
      {messages.map(message =>
        <Alert color="danger" key={message}>{message}</Alert>,
      )}
    </div>
  );
};

ErrorMessages.propTypes = {
  failureMessage: PropTypes.object,
  failureStatus: PropTypes.number,
  errorMessages: PropTypes.array,
};

ErrorMessages.defaultProps = {
  failureMessage: null,
  failureStatus: null,
  errorMessages: PropTypes.arrayOf(
    PropTypes.string,
  ),
};

export default ErrorMessages;
