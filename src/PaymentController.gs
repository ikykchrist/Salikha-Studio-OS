/**
 * PaymentController.gs
 * Server entry points for payments, receivables, and refunds
 * (Sprint 3). Every payment posts exactly one linked cash inflow.
 */

function getBookingPayments(bookingId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PaymentRepository.listPayments({ bookingId: bookingId, pageSize: 100 }), 'Booking payments retrieved.');
  })();
}

function getPayments(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PaymentRepository.listPayments(filters || {}), 'Payments retrieved.');
  })();
}

function getPayment(paymentId) {
  return ErrorService.wrap(function () {
    var payment = PaymentRepository.getPayment(paymentId);
    if (!payment) {
      throw ErrorService.create(ErrorService.CODES.PAYMENT_NOT_FOUND, 'The payment was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    payment.allocations = PaymentRepository.listAllocations(paymentId, null);
    return ResponseService.success(payment, 'Payment retrieved.');
  })();
}

function recordBookingPayment(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PaymentService.recordBookingPayment(payload || {}), 'Payment recorded and posted to the cash ledger.');
  })();
}

function voidBookingPayment(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PaymentService.voidBookingPayment(payload || {}), 'Payment voided. Cash effect reversed.');
  })();
}

function getReceivables(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ReceivableService.listReceivables(filters || {}), 'Receivables retrieved.');
  })();
}

function getClientReceivableSummary(clientId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ReceivableService.getClientReceivableSummary(clientId), 'Client receivable summary retrieved.');
  })();
}

function getBookingReceivableSummary(bookingId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ReceivableService.getBookingReceivableSummary(bookingId), 'Booking receivable summary retrieved.');
  })();
}

function verifyPaymentLedgerLinks() {
  return ErrorService.wrap(function () {
    return ResponseService.success(PaymentService.verifyPaymentLedgerLinks(), 'Payment-ledger verification completed.');
  })();
}

function verifyBookingPaymentBalances() {
  return ErrorService.wrap(function () {
    return ResponseService.success(BookingService.verifyBookingBalances(true), 'Booking balances verified and repaired where needed.');
  })();
}

function getRefundEligibility(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(RefundService.getRefundEligibility(payload && payload.paymentId), 'Refund eligibility retrieved.');
  })();
}

function recordRefund(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(RefundService.recordRefund(payload || {}), 'Refund recorded and posted to the cash ledger.');
  })();
}

function voidRefund(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(RefundService.voidRefund(payload || {}), 'Refund voided. Cash effect reversed.');
  })();
}
