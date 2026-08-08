/**
 * PackageController.gs
 * Server entry points for Packages, package items, and add-ons
 * (Sprint 2). No financial ledger transactions are ever created here.
 */

function getPackages(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PackageRepository.listPackages(filters || {}), 'Packages retrieved.');
  })();
}

function getPackage(packageId) {
  return ErrorService.wrap(function () {
    var pkg = PackageRepository.getPackage(packageId);
    if (!pkg) {
      throw ErrorService.create(ErrorService.CODES.PACKAGE_NOT_FOUND, 'The package was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return ResponseService.success(pkg, 'Package retrieved.');
  })();
}

function createPackage(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PackageService.createPackage(payload || {}), 'Package created.');
  })();
}

function updatePackage(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PackageService.updatePackage(payload || {}), 'Package updated.');
  })();
}

function deactivatePackage(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PackageService.deactivatePackage(payload || {}), 'Package deactivated.');
  })();
}

function reactivatePackage(packageId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PackageService.reactivatePackage(packageId), 'Package reactivated.');
  })();
}

function getPackageItems(packageId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PackageRepository.listItems(packageId), 'Package items retrieved.');
  })();
}

function savePackageItems(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PackageService.savePackageItems(payload || {}), 'Package items saved.');
  })();
}

function getPackageAddOns(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PackageRepository.listAddOns(filters || {}), 'Add-ons retrieved.');
  })();
}

function getPackageAddOn(addOnId) {
  return ErrorService.wrap(function () {
    var addOn = PackageRepository.getAddOn(addOnId);
    if (!addOn) {
      throw ErrorService.create(ErrorService.CODES.ADD_ON_NOT_FOUND, 'The add-on was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return ResponseService.success(addOn, 'Add-on retrieved.');
  })();
}

function createPackageAddOn(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PackageService.createAddOn(payload || {}), 'Add-on created.');
  })();
}

function updatePackageAddOn(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PackageService.updateAddOn(payload || {}), 'Add-on updated.');
  })();
}

function deactivatePackageAddOn(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PackageService.deactivateAddOn(payload || {}), 'Add-on deactivated.');
  })();
}

function calculatePackageProfitability(payload) {
  return ErrorService.wrap(function () {
    var price = Number(payload && payload.basePrice);
    var cost = Number(payload && payload.expectedDirectCost || 0);
    if (isNaN(price) || price < 0) {
      throw ErrorService.create(ErrorService.CODES.INVALID_PACKAGE_PRICE, 'Base price must be zero or greater.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (isNaN(cost) || cost < 0) {
      throw ErrorService.create(ErrorService.CODES.INVALID_PACKAGE_COST, 'Expected direct cost cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return ResponseService.success(PackageService.calculateProfitability(price, cost), 'Package profitability calculated.');
  })();
}
