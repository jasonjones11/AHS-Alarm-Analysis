"""
License Management System for AHS Alarm Analysis
Simple MAC address-based license validation with embedded license database
"""

import json
import re
import hashlib
import platform
import subprocess
from datetime import datetime
from typing import List, Dict, Optional, Any
from pathlib import Path
import logging

class LicenseManager:
    """Simple MAC address-based license manager"""

    def __init__(self, license_file: str = "licenses.json"):
        self.license_file = Path(__file__).parent / license_file
        self.logger = logging.getLogger(__name__)

        # Admin master keys that work on any machine
        self.ADMIN_MASTER_KEYS = [
            "ADMIN-2025-MASTER-ANYMAC-EXP209912-OVERRIDE",
            "ADMIN-2025-BACKUP-ANYMAC-EXP209912-OVERRIDE"
        ]

        self._load_licenses()

    def _load_licenses(self):
        """Load license database from file"""
        try:
            if self.license_file.exists():
                with open(self.license_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.licenses = data.get('licenses', {})
            else:
                self.licenses = {}
                self._create_default_license_file()
        except Exception as e:
            self.logger.error(f"Error loading licenses: {e}")
            self.licenses = {}

    def _create_default_license_file(self):
        """Create default license file with admin keys"""
        default_data = {
            "licenses": {
                "ADMIN-2025-MASTER-ANYMAC-EXP209912-OVERRIDE": {
                    "name": "Administrator",
                    "mac_address": "ANY",
                    "expiry_date": "2099-12-31",
                    "created_date": "2025-01-01",
                    "user_type": "admin"
                }
            },
            "metadata": {
                "created": datetime.now().isoformat(),
                "version": "1.0"
            }
        }

        try:
            with open(self.license_file, 'w', encoding='utf-8') as f:
                json.dump(default_data, f, indent=2)
            self.licenses = default_data['licenses']
        except Exception as e:
            self.logger.error(f"Error creating default license file: {e}")

    def get_machine_mac_addresses(self) -> List[str]:
        """Get all MAC addresses from the current machine"""
        mac_addresses = []

        try:
            if platform.system().lower() == 'windows':
                # Use getmac command for Windows
                result = subprocess.run(['getmac', '/v', '/fo', 'csv'],
                                      capture_output=True, text=True, check=True)

                lines = result.stdout.strip().split('\n')[1:]  # Skip header
                for line in lines:
                    if line.strip():
                        # Parse CSV format: "Connection Name","Network Adapter","Physical Address","Transport Name"
                        parts = [part.strip('"') for part in line.split(',')]
                        if len(parts) >= 3 and parts[2] != 'N/A':
                            mac = parts[2].replace('-', '').upper()
                            if self._is_valid_mac(mac) and mac not in mac_addresses:
                                mac_addresses.append(mac)
            else:
                # Linux/Mac fallback
                import uuid
                mac = ':'.join(['{:02x}'.format((uuid.getnode() >> elements) & 0xff)
                              for elements in range(0,2*6,2)][::-1])
                mac = mac.replace(':', '').upper()
                if self._is_valid_mac(mac):
                    mac_addresses.append(mac)

        except Exception as e:
            self.logger.error(f"Error getting MAC addresses: {e}")
            # Fallback to uuid method
            try:
                import uuid
                mac = hex(uuid.getnode())[2:].upper().zfill(12)
                if self._is_valid_mac(mac):
                    mac_addresses.append(mac)
            except:
                pass

        self.logger.info(f"Found MAC addresses: {mac_addresses}")
        return mac_addresses

    def _is_valid_mac(self, mac: str) -> bool:
        """Validate MAC address format"""
        if not mac or len(mac) != 12:
            return False

        # Check if all characters are hex
        try:
            int(mac, 16)
        except ValueError:
            return False

        # Ignore broadcast, multicast, and invalid MACs
        invalid_macs = ['FFFFFFFFFFFF', '000000000000']
        return mac not in invalid_macs

    def parse_license_key(self, license_key: str) -> Optional[Dict[str, str]]:
        """Parse license key format: AHS-2025-USER-MACAABBCC-EXP251231-CHK789"""
        if not license_key:
            return None

        # Check for admin master keys first
        if license_key in self.ADMIN_MASTER_KEYS:
            return {
                'product': 'ADMIN',
                'year': '2025',
                'user': 'MASTER',
                'mac': 'ANY',
                'expiry': '2099-12-31',
                'checksum': 'OVERRIDE',
                'is_admin': True
            }

        # Parse regular license key format
        pattern = r'^AHS-(\d{4})-([A-Z0-9]+)-MAC([A-F0-9]{6})-EXP(\d{6})-CHK([A-F0-9]+)$'
        match = re.match(pattern, license_key.upper())

        if not match:
            return None

        year, user, mac, expiry_str, checksum = match.groups()

        # Convert expiry string to date format
        try:
            expiry_date = f"20{expiry_str[:2]}-{expiry_str[2:4]}-{expiry_str[4:6]}"
            datetime.strptime(expiry_date, '%Y-%m-%d')  # Validate date format
        except ValueError:
            return None

        return {
            'product': 'AHS',
            'year': year,
            'user': user,
            'mac': mac,
            'expiry': expiry_date,
            'checksum': checksum,
            'is_admin': False
        }

    def validate_license(self, license_key: str) -> Dict[str, Any]:
        """Validate license key against current machine and expiry"""
        result = {
            'valid': False,
            'reason': 'Invalid license key',
            'user_type': 'regular',
            'expires': None,
            'mac_bound': None
        }

        # Parse license key
        parsed = self.parse_license_key(license_key)
        if not parsed:
            result['reason'] = 'Invalid license key format'
            return result

        # Check if license exists in database
        if license_key not in self.licenses:
            result['reason'] = 'License key not found in database'
            return result

        license_info = self.licenses[license_key]

        # Handle admin master keys
        if parsed['is_admin']:
            result.update({
                'valid': True,
                'reason': 'Admin master key',
                'user_type': 'admin',
                'expires': parsed['expiry'],
                'mac_bound': 'ANY'
            })
            return result

        # Check expiry date
        try:
            expiry_date = datetime.strptime(parsed['expiry'], '%Y-%m-%d')
            if expiry_date.date() < datetime.now().date():
                result['reason'] = f"License expired on {parsed['expiry']}"
                return result
        except ValueError:
            result['reason'] = 'Invalid expiry date format'
            return result

        # Check MAC address binding
        current_macs = self.get_machine_mac_addresses()
        license_mac = parsed['mac']

        # Check if license MAC matches any current MAC (partial match - first 6 chars)
        mac_match = False
        for current_mac in current_macs:
            if current_mac[:6] == license_mac or current_mac == license_mac + '000000':
                mac_match = True
                break

        if not mac_match:
            result['reason'] = f"License bound to different hardware (MAC: {license_mac})"
            result['mac_bound'] = license_mac
            return result

        # License is valid
        result.update({
            'valid': True,
            'reason': 'Valid license',
            'user_type': license_info.get('user_type', 'regular'),
            'expires': parsed['expiry'],
            'mac_bound': license_mac,
            'name': license_info.get('name', 'Unknown User')
        })

        return result

    def generate_license_key(self, name: str, mac_address: str, expiry_date: str, user_id: str = None) -> str:
        """Generate a license key for given parameters"""
        # Clean MAC address
        mac_clean = re.sub(r'[^A-F0-9]', '', mac_address.upper())
        if len(mac_clean) >= 6:
            mac_short = mac_clean[:6]
        else:
            raise ValueError(f"Invalid MAC address: {mac_address}")

        # Generate user ID if not provided
        if not user_id:
            user_id = re.sub(r'[^A-Z0-9]', '', name.upper())[:6]
            if len(user_id) < 3:
                user_id = f"USER{hash(name) % 1000:03d}"

        # Format expiry date
        try:
            expiry_dt = datetime.strptime(expiry_date, '%Y-%m-%d')
            expiry_str = expiry_dt.strftime('%y%m%d')
        except ValueError:
            raise ValueError(f"Invalid expiry date format: {expiry_date}. Use YYYY-MM-DD")

        # Generate checksum
        data_to_hash = f"AHS2025{user_id}{mac_short}{expiry_str}"
        checksum = hashlib.md5(data_to_hash.encode()).hexdigest()[:6].upper()

        # Create license key
        license_key = f"AHS-2025-{user_id}-MAC{mac_short}-EXP{expiry_str}-CHK{checksum}"

        return license_key

    def add_license(self, license_key: str, name: str, mac_address: str, expiry_date: str) -> bool:
        """Add a new license to the database"""
        try:
            # Validate license key format
            parsed = self.parse_license_key(license_key)
            if not parsed:
                return False

            # Add to licenses
            self.licenses[license_key] = {
                'name': name,
                'mac_address': mac_address,
                'expiry_date': expiry_date,
                'created_date': datetime.now().isoformat()[:10],
                'user_type': 'regular'
            }

            # Save to file
            return self._save_licenses()

        except Exception as e:
            self.logger.error(f"Error adding license: {e}")
            return False

    def _save_licenses(self) -> bool:
        """Save license database to file"""
        try:
            data = {
                'licenses': self.licenses,
                'metadata': {
                    'updated': datetime.now().isoformat(),
                    'version': '1.0'
                }
            }

            with open(self.license_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            return True

        except Exception as e:
            self.logger.error(f"Error saving licenses: {e}")
            return False

    def get_license_info(self, license_key: str) -> Optional[Dict[str, Any]]:
        """Get detailed license information"""
        if license_key in self.licenses:
            info = self.licenses[license_key].copy()
            info['license_key'] = license_key

            # Add validation status
            validation = self.validate_license(license_key)
            info['validation_status'] = validation

            return info
        return None

    def list_all_licenses(self) -> List[Dict[str, Any]]:
        """List all licenses with their status"""
        results = []
        for license_key, license_data in self.licenses.items():
            info = license_data.copy()
            info['license_key'] = license_key

            # Add validation status
            validation = self.validate_license(license_key)
            info['validation_status'] = validation

            results.append(info)

        return results