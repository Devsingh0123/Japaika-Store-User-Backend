import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import app from '../../app.js';
import { sequelize, User, UserAddress, PostalCode } from '../../models/index.js';
import { ACCESS_COOKIE_NAME, signAccessToken } from '../../services/token.service.js';
import { parsePostalDataset, importPostalRecords } from '../../utils/importPostalCodes.js';

describe('Customer Profile, Address Book & Postal Code Auto-Fill integration tests (/api/v1/profile & /api/v1/addresses)', () => {
  const runTag = crypto.randomBytes(4).toString('hex');
  const createdUserIds = [];
  const createdPostalPairs = [];

  let customer;
  let customerCookie;
  let otherCustomer;
  let otherCookie;

  before(async () => {
    customer = await User.create({
      email: `profile.${runTag}@japaika-test.local`,
      isEmailVerified: true,
      status: 'active',
    });
    createdUserIds.push(customer.id);
    customerCookie = `${ACCESS_COOKIE_NAME}=${signAccessToken(customer)}`;

    otherCustomer = await User.create({
      email: `other.${runTag}@japaika-test.local`,
      isEmailVerified: true,
      status: 'active',
    });
    createdUserIds.push(otherCustomer.id);
    otherCookie = `${ACCESS_COOKIE_NAME}=${signAccessToken(otherCustomer)}`;

    const parsed = parsePostalDataset(
      [
        {
          country: 'IN',
          postalCode: '999901',
          city: 'Bengaluru',
          district: 'Bengaluru Urban',
          state: 'Karnataka',
          stateCode: 'KA',
        },
        {
          country: 'US',
          postalCode: '99901',
          city: 'Ketchikan',
          district: 'Ketchikan Gateway Borough',
          state: 'Alaska',
          stateCode: 'AK',
        },
      ],
      { format: 'json' }
    );
    await importPostalRecords(parsed.records);
    createdPostalPairs.push(
      { country: 'IN', postalCode: '999901' },
      { country: 'US', postalCode: '99901' }
    );
  });

  after(async () => {
    for (const pair of createdPostalPairs) {
      await PostalCode.destroy({ where: pair });
    }
    if (createdUserIds.length) {
      await UserAddress.destroy({ where: { userId: createdUserIds }, force: true });
      await User.destroy({ where: { id: createdUserIds }, force: true });
    }
    await sequelize.close();
  });

  describe('GET /api/v1/profile & PATCH /api/v1/profile', () => {
    it('requires authentication and returns customer profile with defaultAddress: null initially', async () => {
      const unauth = await request(app).get('/api/v1/profile');
      assert.equal(unauth.status, 401);

      const res = await request(app).get('/api/v1/profile').set('Cookie', customerCookie);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.user.id, customer.id);
      assert.equal(res.body.data.user.email, customer.email);
      assert.equal(res.body.data.user.fullName, null);
      assert.equal(res.body.data.user.phone, null);
      assert.equal(res.body.data.defaultAddress, null);
    });

    it('updates fullName and phone (IN/US valid formats) and allows clearing phone to null', async () => {
      const updateRes = await request(app)
        .patch('/api/v1/profile')
        .set('Cookie', customerCookie)
        .send({
          fullName: '  Ananya Sharma  ',
          phone: '+91 98765 43210',
        });

      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.data.user.fullName, 'Ananya Sharma');
      assert.equal(updateRes.body.data.user.phone, '+91 98765 43210');

      const clearPhoneRes = await request(app)
        .patch('/api/v1/profile')
        .set('Cookie', customerCookie)
        .send({ phone: null });
      assert.equal(clearPhoneRes.status, 200);
      assert.equal(clearPhoneRes.body.data.user.fullName, 'Ananya Sharma');
      assert.equal(clearPhoneRes.body.data.user.phone, null);

      const badPhoneRes = await request(app)
        .patch('/api/v1/profile')
        .set('Cookie', customerCookie)
        .send({ phone: '123' });
      assert.equal(badPhoneRes.status, 400);
      assert.equal(badPhoneRes.body.error.code, 'VALIDATION_ERROR');

      const emptyPatchRes = await request(app)
        .patch('/api/v1/profile')
        .set('Cookie', customerCookie)
        .send({});
      assert.equal(emptyPatchRes.status, 400);
    });
  });

  describe('GET /api/v1/addresses/lookup (Self-Hosted MySQL Postal Code Auto-Fill)', () => {
    it('returns city, district, state, and stateCode for known IN PIN and US ZIP/ZIP+4 codes', async () => {
      const inRes = await request(app).get('/api/v1/addresses/lookup?country=IN&postalCode=999901');
      assert.equal(inRes.status, 200);
      assert.deepEqual(inRes.body.data, {
        found: true,
        country: 'IN',
        postalCode: '999901',
        city: 'Bengaluru',
        district: 'Bengaluru Urban',
        state: 'Karnataka',
        stateCode: 'KA',
      });

      const usRes = await request(app).get('/api/v1/addresses/lookup?country=US&postalCode=99901-4321');
      assert.equal(usRes.status, 200);
      assert.deepEqual(usRes.body.data, {
        found: true,
        country: 'US',
        postalCode: '99901',
        city: 'Ketchikan',
        district: 'Ketchikan Gateway Borough',
        state: 'Alaska',
        stateCode: 'AK',
      });
    });

    it('returns found: false (200 OK) when postal code is valid format but missing from DB so manual entry works', async () => {
      const missingRes = await request(app).get('/api/v1/addresses/lookup?country=IN&postalCode=999902');
      assert.equal(missingRes.status, 200);
      assert.deepEqual(missingRes.body.data, {
        found: false,
        country: 'IN',
        postalCode: '999902',
        city: null,
        district: null,
        state: null,
        stateCode: null,
      });
    });

    it('returns 400 VALIDATION_ERROR for malformed postal codes', async () => {
      const badIn = await request(app).get('/api/v1/addresses/lookup?country=IN&postalCode=12345');
      assert.equal(badIn.status, 400);
      assert.equal(badIn.body.error.code, 'VALIDATION_ERROR');

      const badUs = await request(app).get('/api/v1/addresses/lookup?country=US&postalCode=ABCDE');
      assert.equal(badUs.status, 400);
      assert.equal(badUs.body.error.code, 'VALIDATION_ERROR');
    });
  });

  describe('Customer Address Book CRUD, Postal Auto-Fill, Manual Entry & Default Lifecycle (/api/v1/addresses)', () => {
    let inAddressAutoFilled;
    let inAddressManual;
    let usAddress;

    it('auto-fills city, district, and state from MySQL postal_codes on POST /api/v1/addresses and forces first address as default', async () => {
      const res = await request(app)
        .post('/api/v1/addresses')
        .set('Cookie', customerCookie)
        .send({
          label: 'home',
          fullName: 'Ananya Sharma',
          phone: '+919876543210',
          addressLine1: 'Flat 402, Lotus Residency, MG Road',
          addressLine2: 'Indiranagar',
          landmark: 'Near Metro Station',
          postalCode: '999901',
          country: 'IN',
          isDefault: false, // First address must become default automatically
        });

      assert.equal(res.status, 201);
      inAddressAutoFilled = res.body.data.address;
      assert.equal(inAddressAutoFilled.city, 'Bengaluru');
      assert.equal(inAddressAutoFilled.district, 'Bengaluru Urban');
      assert.equal(inAddressAutoFilled.state, 'Karnataka');
      assert.equal(inAddressAutoFilled.postalCode, '999901');
      assert.equal(inAddressAutoFilled.country, 'IN');
      assert.equal(inAddressAutoFilled.isDefault, true);

      // Profile now returns this defaultAddress
      const profileRes = await request(app).get('/api/v1/profile').set('Cookie', customerCookie);
      assert.equal(profileRes.status, 200);
      assert.equal(profileRes.body.data.defaultAddress.id, inAddressAutoFilled.id);
      assert.equal(profileRes.body.data.defaultAddress.district, 'Bengaluru Urban');
    });

    it('supports manual city, district, and state entry when valid postal code is missing from postal_codes', async () => {
      // Missing from postal_codes AND no city/state provided -> 400 VALIDATION_ERROR
      const missingFieldsRes = await request(app)
        .post('/api/v1/addresses')
        .set('Cookie', customerCookie)
        .send({
          label: 'work',
          fullName: 'Ananya Sharma',
          phone: '9876543210',
          addressLine1: 'Plot 18, Cyber Park',
          postalCode: '999902',
          country: 'IN',
        });
      assert.equal(missingFieldsRes.status, 400);
      assert.equal(missingFieldsRes.body.error.code, 'VALIDATION_ERROR');

      // Manual city, district, and state provided -> 201 Created
      const manualRes = await request(app)
        .post('/api/v1/addresses')
        .set('Cookie', customerCookie)
        .send({
          label: 'work',
          fullName: 'Ananya Sharma',
          phone: '9876543210',
          addressLine1: 'Plot 18, Cyber Park',
          city: 'Mysuru',
          district: 'Mysuru District',
          state: 'Karnataka',
          postalCode: '999902',
          country: 'IN',
        });

      assert.equal(manualRes.status, 201);
      inAddressManual = manualRes.body.data.address;
      assert.equal(inAddressManual.city, 'Mysuru');
      assert.equal(inAddressManual.district, 'Mysuru District');
      assert.equal(inAddressManual.state, 'Karnataka');
      assert.equal(inAddressManual.isDefault, false);
    });

    it('creates a US address with ZIP+4 auto-fill and atomically switches default when isDefault: true', async () => {
      const usRes = await request(app)
        .post('/api/v1/addresses')
        .set('Cookie', customerCookie)
        .send({
          label: 'other',
          fullName: 'Rajesh Verma',
          phone: '+1 (415) 555-2671',
          addressLine1: '742 Harbor Way',
          addressLine2: 'Suite 3B',
          postalCode: '99901-4321',
          country: 'US',
          isDefault: true,
        });

      assert.equal(usRes.status, 201);
      usAddress = usRes.body.data.address;
      assert.equal(usAddress.country, 'US');
      assert.equal(usAddress.postalCode, '99901-4321');
      assert.equal(usAddress.city, 'Ketchikan');
      assert.equal(usAddress.district, 'Ketchikan Gateway Borough');
      assert.equal(usAddress.state, 'Alaska');
      assert.equal(usAddress.isDefault, true);

      // Listing addresses shows US address first (isDefault: true) and filters by country
      const listAll = await request(app).get('/api/v1/addresses').set('Cookie', customerCookie);
      assert.equal(listAll.status, 200);
      assert.equal(listAll.body.data.items.length, 3);
      assert.equal(listAll.body.data.items[0].id, usAddress.id);
      assert.equal(listAll.body.data.items.filter((a) => a.isDefault).length, 1);

      const listIn = await request(app)
        .get('/api/v1/addresses?country=IN')
        .set('Cookie', customerCookie);
      assert.equal(listIn.status, 200);
      assert.equal(listIn.body.data.items.length, 2);
      assert.ok(listIn.body.data.items.every((a) => a.country === 'IN'));
    });

    it('enforces cross-country postal validation on PATCH and supports PATCH /:id/default', async () => {
      // Cannot change country to US while keeping 6-digit Indian PIN code 999902
      const invalidCrossPatch = await request(app)
        .patch(`/api/v1/addresses/${inAddressManual.id}`)
        .set('Cookie', customerCookie)
        .send({ country: 'US' });
      assert.equal(invalidCrossPatch.status, 400);
      assert.equal(invalidCrossPatch.body.error.code, 'VALIDATION_ERROR');

      // Update district & landmark on manual IN address
      const patchRes = await request(app)
        .patch(`/api/v1/addresses/${inAddressManual.id}`)
        .set('Cookie', customerCookie)
        .send({
          district: 'Mysuru Urban',
          landmark: 'Opposite Tech Tower',
        });
      assert.equal(patchRes.status, 200);
      assert.equal(patchRes.body.data.address.district, 'Mysuru Urban');
      assert.equal(patchRes.body.data.address.landmark, 'Opposite Tech Tower');

      // Designate inAddressManual as default via PATCH /:id/default
      const defaultRes = await request(app)
        .patch(`/api/v1/addresses/${inAddressManual.id}/default`)
        .set('Cookie', customerCookie);
      assert.equal(defaultRes.status, 200);
      assert.equal(defaultRes.body.data.address.isDefault, true);
    });

    it('enforces strict customer ownership isolation (BR-10) across GET, PATCH, default, and DELETE', async () => {
      assert.equal(
        (
          await request(app)
            .get(`/api/v1/addresses/${inAddressManual.id}`)
            .set('Cookie', otherCookie)
        ).status,
        404
      );
      assert.equal(
        (
          await request(app)
            .patch(`/api/v1/addresses/${inAddressManual.id}`)
            .set('Cookie', otherCookie)
            .send({ city: 'Hacked' })
        ).status,
        404
      );
      assert.equal(
        (
          await request(app)
            .patch(`/api/v1/addresses/${inAddressManual.id}/default`)
            .set('Cookie', otherCookie)
        ).status,
        404
      );
      assert.equal(
        (
          await request(app)
            .delete(`/api/v1/addresses/${inAddressManual.id}`)
            .set('Cookie', otherCookie)
        ).status,
        404
      );
    });

    it('soft-deletes default address and automatically promotes most recently updated remaining address', async () => {
      const delRes = await request(app)
        .delete(`/api/v1/addresses/${inAddressManual.id}`)
        .set('Cookie', customerCookie);

      assert.equal(delRes.status, 200);
      assert.equal(delRes.body.data.id, inAddressManual.id);
      assert.equal(delRes.body.data.deleted, true);
      assert.ok(delRes.body.data.newDefaultAddressId);

      // Deleted address is no longer accessible via GET /:id
      const getDeleted = await request(app)
        .get(`/api/v1/addresses/${inAddressManual.id}`)
        .set('Cookie', customerCookie);
      assert.equal(getDeleted.status, 404);

      // Remaining addresses still have exactly 1 default matching newDefaultAddressId
      const listRes = await request(app).get('/api/v1/addresses').set('Cookie', customerCookie);
      assert.equal(listRes.body.data.items.length, 2);
      const defaults = listRes.body.data.items.filter((a) => a.isDefault);
      assert.equal(defaults.length, 1);
      assert.equal(defaults[0].id, delRes.body.data.newDefaultAddressId);
    });
  });
});
