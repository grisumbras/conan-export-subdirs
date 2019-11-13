const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ini = require('ini');


function get_env(name) { return (process.env[name] || '').trim(); }

async function get_output(command, ...args) {
  let output = '';
  const opts = {
    listeners: { stdout: (data) => { output += data.toString(); } }
  };
  await exec.exec(command, args, opts);

  output = output.trim();
  return 'None' != output ? output : '' ;
}

async function inspect_pkg(attr) {
  return await get_output('conan', 'inspect', '.', '--raw', attr);
}

async function get_input_or_pkg_attr(attr) {
  let result = core.getInput(attr);
  if (!result) { result  = await inspect_pkg(attr); }
  return result;
}

async function get_pkg_user() {
  let result = core.getInput('user');

  if (!result) { result = get_env('CONAN_USERNAME'); }

  if (!result) { result = await inspect_pkg('default_user'); }

  if (!result) {
    const repo = get_env('GITHUB_REPOSITORY');
    result = (repo.split('/', 1) || [ '' ])[0].trim();
  }

  return result;
}

async function get_pkg_channel() {
  let result = core.getInput('channel');

  if (!result) { result = get_env('CONAN_CHANNEL'); }

  if (!result) { result = await inspect_pkg('default_channel'); }

  if (!result) { result = 'testing'; }

  return result;
}

async function get_pkg_reference() {
  let result = core.getInput('reference');
  if (!result) {
    const name = await get_input_or_pkg_attr('name');
    const version = await get_input_or_pkg_attr('version');
    const user = await get_pkg_user();
    const channel = await get_pkg_channel();
    result = `${name}/${version}@${user}/${channel}`
  }
  return result;
}

function info_to_profile(input) {
  const allowed_sections = ['settings', 'options', 'env', 'build_requires']
  let source = ini.parse(input);
  let destination = {};

  for (let section in source) {
    if (!allowed_sections.includes(section)) { continue; }
    destination[section] = source[section];
  }
  return 'include(default)\n\n' + ini.encode(destination);
}

async function run() {
  const pkg_reference = await get_pkg_reference();
  console.log()
  console.log(`Using full package reference ${pkg_reference}`);

  const parent = core.getInput('path');
  fs.readdirSync(parent).forEach(async function(subdir) {
    const package_dir = path.join(parent, subdir);
    const input
      = fs.readFileSync(path.join(package_dir, 'conaninfo.txt'), 'utf-8');

    const profile_path = path.join(os.tmpdir(), subdir);
    fs.writeFileSync(profile_path, info_to_profile(input));

    console.log(`Exporting package from ${package_dir}`);
    await exec.exec(
      'conan',
      [
        'export-pkg',
        '-pr', profile_path,
        '-pf', package_dir,
        '.',
        pkg_reference
      ]
    );
  });
}

run()
