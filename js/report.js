(function () {
  function emptyBucket() {
    return { billCount: 0, netSen: 0 };
  }

  function addBill(bucket, grandSen) {
    bucket.billCount += 1;
    bucket.netSen += grandSen;
  }

  function summariseDay(date, paidOrders, voidOrders) {
    var report = {
      billCount: 0,
      grossSen: 0,
      discountSen: 0,
      serviceChargeSen: 0,
      sstSen: 0,
      roundingSen: 0,
      netSen: 0,
      byMethod: {},
      byType: { dine_in: emptyBucket(), takeaway: emptyBucket() },
      voidedItems: [],
      voidedBills: []
    };
    var bills = paidOrders || [];
    var i;
    for (i = 0; i < bills.length; i++) {
      var order = bills[i];
      var bill = order && order.bill;
      if (!bill || bill.businessDate !== date || bill.void) continue;
      var totals = bill.totals || {};
      var grand = totals.grandTotalSen || 0;
      report.billCount += 1;
      report.grossSen += totals.subtotalSen || 0;
      report.discountSen += totals.discountSen || 0;
      report.serviceChargeSen += totals.serviceChargeSen || 0;
      report.sstSen += totals.sstSen || 0;
      report.roundingSen += totals.roundingSen || 0;
      report.netSen += grand;
      var method = bill.payment && bill.payment.method ? bill.payment.method : 'Other';
      if (!report.byMethod[method]) report.byMethod[method] = emptyBucket();
      addBill(report.byMethod[method], grand);
      var type = order.type || 'dine_in';
      if (!report.byType[type]) report.byType[type] = emptyBucket();
      addBill(report.byType[type], grand);
    }
    var voids = voidOrders || [];
    for (i = 0; i < voids.length; i++) {
      var source = voids[i];
      var lines = source && source.lines || [];
      var j;
      for (j = 0; j < lines.length; j++) {
        var line = lines[j];
        if (!line.void || line.void.businessDate !== date) continue;
        report.voidedItems.push({
          at: line.void.at,
          businessDate: line.void.businessDate,
          reason: line.void.reason,
          name: line.name,
          amountSen: line.qty * line.unitPriceSen,
          tableId: source.tableId || null,
          takeawayNo: source.takeawayNo || null,
          billNo: source.bill && source.bill.billNo ? source.bill.billNo : null,
          orderId: source.id
        });
      }
    }
    return report;
  }

  var api = { summariseDay: summariseDay };

  if (typeof module !== 'undefined') module.exports = api;
  else {
    window.POS = window.POS || {};
    window.POS.report = api;
  }
})();
