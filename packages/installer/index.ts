import setupSh from './src/setup.sh?raw'
import uninstallTemplateSh from './src/uninstall-template.sh?raw'
import installPy from './src/install.py?raw'
import steamInstallPy from './src/steam_install.py?raw'
import steamctlPy from './src/steamctl.py?raw'
import unpackPy from './src/unpack.py?raw'
import vdfPy from './src/vdf.py?raw'
import configSurgeryPy from './src/config_surgery.py?raw'
import checkInstallPy from './src/check-install.py?raw'

/**
 * The installer that runs on SteamOS, as text for the bundle to pack into
 * meta. These are the same files stages 1 and 2 were verified with; the build
 * only wraps them, it never rewrites them. They come in through `?raw`, so it
 * takes a bundler that reads it - Vite, in the frontend.
 *
 * Named one by one rather than globbed: a glob would pull whatever else lives
 * in this folder into the bundle as dead weight, and a file renamed out from
 * under us should break the build rather than the installer.
 *
 * `install.py` copies the six modules into the game folder for the uninstaller
 * (5.4), and `check-install.py` is the acceptance run - on someone else's
 * SteamOS it is the only way to tell whether the result matches the recipe.
 */
export const INSTALLER_FILES = [
  {
    name: 'setup.sh',
    source: setupSh
  },
  {
    name: 'uninstall-template.sh',
    source: uninstallTemplateSh
  },
  {
    name: 'install.py',
    source: installPy
  },
  {
    name: 'steam_install.py',
    source: steamInstallPy
  },
  {
    name: 'steamctl.py',
    source: steamctlPy
  },
  {
    name: 'unpack.py',
    source: unpackPy
  },
  {
    name: 'vdf.py',
    source: vdfPy
  },
  {
    name: 'config_surgery.py',
    source: configSurgeryPy
  },
  {
    name: 'check-install.py',
    source: checkInstallPy
  }
]
