process.env.DATABASE_URL = 'postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare_test?schema=public';
process.env.NODE_ENV = 'test';
process.env.APP_PORT = '4000';

require('../dist/main');
