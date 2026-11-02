import { QRCodeSVG } from 'qrcode.react'
import CopyButton from './CopyButton'
import Modal from './Modal'

interface ReceiveModalProps {
  address: string
  onClose: () => void
}

export default function ReceiveModal({
  address,
  onClose
}: ReceiveModalProps) {
  return (
    <Modal title="Receive BDX" onClose={onClose}>
      <div className="receive-content">
        <div className="qr-container">
          <QRCodeSVG
            value={address}
            size={220}
            level="M"
            bgColor="#ffffff"
            fgColor="#071018"
          />
        </div>

        <p className="modal-copy">
          Share this address to receive BDX. Only send Beldex mainnet funds to
          this address.
        </p>

        <code className="receive-address">{address}</code>

        <CopyButton
          value={address}
          label="Copy address"
          className="full-width-button"
        />
      </div>
    </Modal>
  )
}
